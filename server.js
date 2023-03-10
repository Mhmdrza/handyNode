require('dotenv').config({
    path: `./.env`
});
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const AWS = require('aws-sdk/clients/s3.js');
const fetch = require('node-fetch');

const port = 8080;
const upload = multer();
const app = express();
app.use(express.urlencoded({ extended: true }));

console.log({
    endpoint: process.env.ENDPOINT,
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
    bucket: process.env.BUCKET_NAME
})

const s3Client = new AWS({
    endpoint: process.env.ENDPOINT,
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
    region: "default",
    s3ForcePathStyle: true,
});
const OSS_CACHING_ENABLED = false && process.env.CACHING_ENABLED;
const cache = Object.create(null);
function getCache (key) {
    return OSS_CACHING_ENABLED? cache[key]: false;
}
function setCache (key, value) {
    return OSS_CACHING_ENABLED? cache[key] = value: value;
}

const template = getCache('template') || setCache('template', fs.readFileSync(`./template.html`).toString());
function htmlRenderer (rawHtml = '', fileSystemPath = '') {
    return template.replace('<!-- %%%BODY%%% -->', rawHtml || getCache(fileSystemPath) || setCache(fileSystemPath, fs.readFileSync(fileSystemPath).toString()));
};
const editor = htmlRenderer(null, `./editor.html`);


// ! -----------------------------------------
// ! -----------------------------------------
// ! -----------------------------------------

app.get('/', async (req, res) => {
    const pages = (await listObjects()).map(s3Obj => `<li style="">
        <a href='${s3Obj.Key.replace('.html','')}' >${s3Obj.Key}</a>
        <a href='/delete/${s3Obj.Key.replace('.html','')}'>x</a>
    </li>`).join('');
    res.send(htmlRenderer( null, './home.html').replace('<!-- %%%PAGES%%% -->', pages))
})

app.get('/file', (req, res) => {
    const downloads = fs.readdirSync('/tmp').map(fileName => `<li>
        <a href='/download/${fileName}' download>${fileName}</a>
        <a href='/delete-file/${fileName}'> x</a>
    </li>`).join('');
    const filePage = htmlRenderer(null, './file.html');
    res.send(filePage.replace('&&&DOWNLOADS&&&', downloads))
})

app.post('/upload', upload.single('file'), (req, res) => {
    const splittedName = req.file.originalname.split('.');
    const fileExtention = splittedName[splittedName.length - 1];
    const normalizedName = req.file.originalname
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/[_]+/g,'_')
    .replace(fileExtention,'')
    .toLowerCase();
    const id = `${normalizedName}${Date.now().toString()}.${fileExtention}`;
    fs.writeFileSync(`/tmp/${id}`, req.file.buffer);
    res.redirect('back');
})

app.get('/download/:path', (req, res) => {
    const { path } = req.params;
    if (!path) {
        res.status(400).json({ name: 'wrong' })
    } else {
        res.download((`/tmp/${path}`));
    }
})

app.get('/delete-file/:path', (req, res) => {
    const { path } = req.params;
    if (!path) {
        res.status(400).json({ name: 'wrong' })
    } else {
        fs.rmSync(`/tmp/${path}`)
        res.redirect('back');
    }
})

app.get('/reset', (req, res) => {
    fs.readdirSync('/tmp').map(fileName => {
        fs.rmSync(`/tmp/${fileName}`)
    })
    res.send('all files deleted');
})

app.get('/editor', (req, res) => {
    res.send(editor)
})

app.get(/\/delete\/(.+)$/, async (req, res) => {
    let slug = req.params[0];
    if(slug.endsWith('/')) slug = slug.slice(0, slug.length - 1)
    console.log({a:1, slug})
    await deleteObject(`${slug}`); 
    res.redirect('back');
})

app.get(/\/edit\/(.+)$/, async (req, res) => {
    let slug = req.params[0];
    if(slug.endsWith('/')) slug = slug.slice(0, slug.length - 1)
    console.log({a:2, slug})
    const pageContent = await fileReader(slug);
    if (pageContent.ok) {
        const page = editor.replace(`/* initialData */`, `initialData: \`${pageContent.txt}\`,`)
        res.send(page);
    } else {
        res.status(400).send(pageContent.txt)
    }
})

app.post(/\save\/(.+)$/, upload.none(), async (req, res) => {
    let slug = req.params[0];
    if(slug.endsWith('/')) slug = slug.slice(0, slug.length - 1)
    await fileWriter(slug, req.body.content);
    res.send(`page: /${slug} saved`);
})

app.get('/downlink', async (req, _res) => {
    const url = (req.query.url);
    let urlProcessed = url.split('/');
    const fileName = Math.random().toString().slice(2, 8) + decodeURIComponent(urlProcessed[urlProcessed.length-1] || urlProcessed[urlProcessed.length-2]);
    const res = await fetch(url);
    const fileStream = fs.createWriteStream('/tmp/' + fileName);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
    _res.send(`file: <a href='/download/${fileName}' >${fileName}</a> saved to /tmp`);
})

app.get('/uploadToS3', async (req, _res) => {
    const path = (req.query.path);
    if (!path) {
        res.status(400).json({ name: 'wrong' })
    } else {
        const file = fs.createReadStream(`/tmp/${path}`);
        await fileWriter(path.replace('835304', ''), file);
        _res.send(`file: ${path} saved to cdn`);
    }
})

app.get(/\/([^\/]+)$/, async (req, res) => {
    let slug = req.params[0];
    if(slug.endsWith('/')) slug = slug.slice(0, slug.length - 1)
    let body = await fileReader(slug); 
    if (body.ok) {
        res.send(htmlRenderer(body.txt));
    } else {
        res.status(400).send(body.txt)
    }
})

async function fileReader (slug) {
    console.log('fileReader', {slug})
    const url = `https://${process.env.BUCKET_NAME}.storage.iran.liara.space/${slug}`;
    const cacheResponse = getCache(slug);
    if (cacheResponse) {
        return { ok: true, txt: cacheResponse };
    } else {
        return fetch(url).then(async res => {
            console.log('request', slug)
            const txt = await res.text();
            if (res.ok) {
                setCache(slug, txt)
            }
            return {
                txt,
                ok: res.ok,
            }
        });
    }
}

async function fileWriter (slug, content) {
    console.log('fileWriter', {slug, content})
    setCache(slug, null);
    return s3Client.putObject({
        Body: content, 
        ACL: "public-read",
        CacheControl: 'max-age=600; public',
        ContentType: 'text/html',
        Bucket: process.env.BUCKET_NAME, 
        Key: `${slug}`,
    }).promise();
}

async function listObjects (slug, content) {
    return (await s3Client.listObjects({
        Bucket: process.env.BUCKET_NAME, 
    }).promise()).Contents;
}

async function deleteObject (key) {
    return s3Client.deleteObject({
        Bucket: process.env.BUCKET_NAME, 
        Key: key
    }).promise();
}

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})