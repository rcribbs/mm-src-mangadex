import "core-js/features/url";

class ChapterListItem {
    number = "";
    // Number is the chapter number. Could be an actual number like "1" or could
    // be a special chapter like "EX" or "Omake".
    //
    title = "";
    // Name is the short title of the chapter.
    // 
    description = "";
    // Description is the longer description of the chapter. May be blank
    // depending on the way the website handles information about chapters.
    // 
    identifier = "";
    // Identifier is a source-specific identifier. Could be an id like "1234" or
    // anything that makes sense for this source. This identifier will be
    // provided in getChapter call as chapterIdentifier to retrieve the chapter
    // pages.
    // 
    group = null
    // Optional: Scanalation group if one exists.
    // 
    variant = null
    // Optional: Set variant if there are multiple versions of the same chapter
    //           and group is not present or not enough to differintiate.
    //
    created = null;
    // Optional: Date created as a string if it exists.

    created = null;
    // Optional: Date updated as a string if it exists.

    published = null;
    // Optional: Date of original chapter's publication as a string if it exists.

    constructor({
        number,
        identifier,
        title,
        description = null,
        group = null,
        variant = null,
        created = null,
        updated = null,
        published = null,
    }) {
        this.number = number;
        this.identifier = identifier;
        this.title = title;
        this.description = description;
        this.group = group;
        this.variant = variant;
        this.created = created;
        this.updated = updated;
        this.published = published;
    }
}

class ChapterList {
    chapters = [];
    // Chapters contains all the chapters for a given manga series.
    //

    constructor({ chapters }) {
        this.chapters = chapters;
    }
}

class ChapterData {
    pageUrls = [];
    // PageUrls contains all the page urls for the chapter.

    constructor({ pageUrls }) {
        this.pageUrls = pageUrls;
    }
}

class MangaSeries {
    name = "";
    // Name is the name of the manga series.
    // 
    identifier = "";
    // Identifier is the id or unique identifier for this manga series on this
    // source.
    // 
    ranking = -1;
    // NOTE: Optional
    // Ranking is the a representation of the likelyhood of this result being
    // the correct match. 0 being the best match and Number.MAX_SAFE_INTEGER
    // being the worst match. All negative numbers will be treated as equal.
    // 

    constructor({ name, identifier, ranking = -1 }) {
        this.name = name;
        this.identifier = identifier;
        this.ranking = ranking;
    }
}

class MangaSeriesList {
    results = [];
    // Results is the list of all MangaSeries objects which match this query in
    // a searchManga call.

    constructor({ results = [] }) {
        this.results = results;
    }

    addResult({ name, identifier, ranking = -1 }) {
        this.results.push(MangaSeries({ name, identifier }));
    }
}

export let EXTENSION_ID="0b035abc-ec01-11eb-850d-784f43a622c7";

export async function searchManga(seriesName, offset=0, limit=10) {
    console.debug("searchManga called.");
    let finalUrl = new URL("https://api.mangadex.org/manga");
    console.debug("Initialized url.", { url: finalUrl });
    let searchParams = new URLSearchParams({
        offset: offset,
        limit: limit,
        title: seriesName
    });
    finalUrl.search = searchParams.toString();
    console.debug("Added search params.", { url: finalUrl });

    let response = await fetch(finalUrl);
    let json = await response.json();

    let results = json.results.map(result => {
        const id = result.data.id;
        const title = result.data.attributes.title.en;
        return new MangaSeries({
            identifier: id,
            name: title,
        })
    })

    return new MangaSeriesList({
        results: results,
    })
}

async function resolveGroupId(groupId) {
    console.debug(`Resolving group with id '${groupId}`);
    const scanalationGroupUrl = `https://api.mangadex.org/group/${groupId}`;
    const resp = await fetch(scanalationGroupUrl);
    const json = await resp.json();
    const group = json.data.attributes;
    console.debug(`Found group`, group);
    return group; 
}

export async function listChapters(
    seriesIdentifier, offset=0, limit=500, since=null, order='asc'
) {
    const languages = ["en"];
    const finalUrl = new URL(`https://api.mangadex.org/manga/${seriesIdentifier}/feed`);
    const searchParams = new URLSearchParams({
        'translatedLanguage[]': languages,
        offset: offset,
        limit: limit,
        'order[chapter]': order
    });
    if (since) {
        searchParams.set("updatedAtSince", since);
    }
    console.debug("Final search params.", { params: searchParams.toString() });
    finalUrl.search = searchParams.toString();

    const response = await fetch(finalUrl);
    const json = await response.json();
    const groupIdMap = {};

    const chapters = await Promise.all(json.results.map(async result => {
        const id = result.data.id;
        const {
            title,
            chapter,
            createdAt,
            updatedAt,
            publishAt
        } = result.data.attributes;
        const groupId = result.relationships.filter(rel => (
            rel.type === "scanlation_group"
        )).shift().id;

        let groupName = null;
        console.debug(`Searching for group name with id '${groupId}`);
        if (groupId in groupIdMap) {
            groupName = groupIdMap[groupId].name;
        } else {
            const group = await resolveGroupId(groupId);
            groupIdMap[groupId] = group;
            groupName = group.name;
        }

        console.debug("Found group name.", {
            id: groupId,
            name: groupName
        });


        let chapItem = new ChapterListItem({
            identifier: id,
            title: title,
            number: chapter,
            group: groupName,
            created: createdAt,
            updated: updatedAt,
            published: publishAt,
        });
        console.debug(`Creating final ChapterListItem`, chapItem);
        return chapItem;
    }));

    console.debug(`Creating final chapter list.`, { chapters });
    const chapList = new ChapterList({
        chapters: chapters,
    });

    return chapList;
}

export async function getChapter(chapterIdentifier) {
    // TODO: implement get chapter logic here.

    let response = await fetch(
        `https://api.mangadex.org/chapter/${chapterIdentifier}`
    );
    let json = await response.json();
    const { data: partialUrls, hash } = json.data.attributes;
    let fullUrls = partialUrls.map(url => (
        `https://uploads.mangadex.org/data/${hash}/${url}`

    ))
    return new ChapterData({ pageUrls: fullUrls });
}
