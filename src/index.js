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
    coverUrl = null;
    // NOTE: Optional
    // The coverUrl if one exists. Used to help users identify best matches.

    constructor({ name, identifier, ranking = -1, coverUrl = null }) {
        this.name = name;
        this.identifier = identifier;
        this.ranking = ranking;
        this.coverUrl = coverUrl;
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
        title: seriesName,
        'includes[]': "cover_art",
    });
    finalUrl.search = searchParams.toString();
    console.debug("Added search params.", { url: finalUrl });

    let response = await fetch(finalUrl);
    let json = await response.json();
    
    let results = json.data.map(result => {
        const id = result.id;

        let title = result.attributes.title.en;
        if (!title) {
            title = result.attributes.title.jp;
        }
        if (!title) {
            console.log(
                "Couldn't determine proper title.",
                { raw_data: result }
            )
            return null;
        }

        const coverArts = result.relationships.filter(rel => (
            rel.type === "cover_art"
        ));

        let coverUrl = null;
        if (coverArts.length > 0) {
            const coverFilename = coverArts.shift().attributes.fileName;
            coverUrl = `https://uploads.mangadex.org/covers/${id}/${coverFilename}.512.jpg`;
        }

        return new MangaSeries({
            identifier: id,
            name: title,
            coverUrl: coverUrl,
        })
    }).filter(x => x);

    return new MangaSeriesList({
        results: results,
    });
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

async function normalizeChapterNumbers(json) {
    console.log("Normalizing chapter numbers...");
    const sortedVolumeNumbers = Object.keys(json.volumes).sort((lhs, rhs) => {
        let lhInt = parseInt(lhs);
        let rhInt = parseInt(rhs);

        if (lhInt < rhInt) {
            return -1;
        } else if (lhInt > rhInt) {
            return 1;
        }

        return 0;
    });

    const idAbsoluteChapterNumbers = {};

    let previousTotal = 0;
    for (const volume of sortedVolumeNumbers) {
        console.log(`Processing volume ${volume}`);
        const newChaps = json.volumes[volume].chapters;

        let largestNumber = 0;
        for (const chapNumber in newChaps) {
            console.log(`Processing chapter ${chapNumber}`);
            const chap = newChaps[chapNumber];
            let majorNumber = 0;
            if (chap.chapter.indexOf(".") != -1) {
                const [majorStr, minorStr] = chap.chapter.split(".");
                const major = parseInt(majorStr);
                majorNumber = major;
                idAbsoluteChapterNumbers[chap.id] = `${major + previousTotal}.${minorStr}`
            } else if (!isNaN(chap.chapter)) {
                const number = parseInt(chap.chapter);
                idAbsoluteChapterNumbers[chap.id] = `${number + previousTotal}`;
                majorNumber = number;
            }
            console.log(`Adjusted chapter ${idAbsoluteChapterNumbers[chap.id]}`);
            largestNumber = Math.max(largestNumber, majorNumber);
        }
        previousTotal += largestNumber + 1;
    }

    console.log("Absolute chapter numbers.", { chapNumbers: idAbsoluteChapterNumbers });
    return idAbsoluteChapterNumbers;
}

export async function listChapters(
    seriesIdentifier, offset=0, limit=500, since=null, order='asc'
) {
    const languages = ["en"];
    let finalUrl = new URL(`https://api.mangadex.org/manga/${seriesIdentifier}/aggregate`);
    let searchParams = new URLSearchParams({
        'translatedLanguage[]': languages,
    });
    console.debug("Final search params.", { params: searchParams.toString() });
    finalUrl.search = searchParams.toString();

    let response = await fetch(finalUrl);
    let json = await response.json();

    let idAbsoluteChapterNumbers = {};
    console.log(`volumes: ${JSON.stringify(json.volumes)}`);
    const volume2 = json.volumes["2"];
    console.log(`volume 2: ${JSON.stringify(volume2)}`);
    if (volume2) {
        const chapNums = Object.keys(volume2.chapters).map(x => parseInt(x)).filter(x => x && !x.isNaN);
        const minChap = Math.min(...chapNums);

        console.log(`chapNums: ${JSON.stringify(chapNums)}`);
        console.log(`minChap: ${minChap}`);
        if (minChap <= 1) {
            idAbsoluteChapterNumbers = await normalizeChapterNumbers(json);
        }
    }

    console.log("Absolute chapter numbers (main).", { chapNumbers: idAbsoluteChapterNumbers });

    finalUrl = new URL(`https://api.mangadex.org/manga/${seriesIdentifier}/feed`);
    searchParams = new URLSearchParams({
        'translatedLanguage[]': languages,
        offset: offset,
        limit: limit,
        'order[chapter]': order,
        'includes[]': "scanlation_group"
    });
    if (since) {
        searchParams.set("updatedAtSince", since);
    }
    finalUrl.search = searchParams.toString();

    response = await fetch(finalUrl);
    json = await response.json();

    const groupIdMap = {};

    const chapters = await Promise.all(json.data.map(async result => {
        const id = result.id;
        const {
            title,
            chapter,
            createdAt,
            updatedAt,
            publishAt
        } = result.attributes;
        const groupRelationship = result.relationships.filter(rel => (
            rel.type === "scanlation_group"
        ));
        let groupName = null;
        if (groupRelationship.length > 0) {
            groupName = groupRelationship.shift().attributes.name
        }

        let number = idAbsoluteChapterNumbers[id];
        console.log("Looked up absolute number.", { number: number, id: id });
        if (!number) {
            number = chapter;
        }
        let chapItem = new ChapterListItem({
            identifier: id,
            title: title,
            number: number,
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
        `https://api.mangadex.org/at-home/server/${chapterIdentifier}?forcePort443=true`
    );
    let json = await response.json();
    const { baseUrl, chapter } = json;
    const { data: partialUrls, hash } = chapter;
    let fullUrls = partialUrls.map(url => (
        `${baseUrl}/data/${hash}/${url}`
    ))
    return new ChapterData({ pageUrls: fullUrls });
}
