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
const CACHING_ENABLED = process.env.CACHING_ENABLED;
const cache = Object.create(null);
function getCache (key) {
    return CACHING_ENABLED? cache[key]: false;
}
function setCache (key, value) {
    return CACHING_ENABLED? cache[key] = value: value;
}

// ! -----------------------------------------
// ! -----------------------------------------
// ! -----------------------------------------

app.get('/', (req, res) => {
    res.sendFile('./index.html', {root: __dirname })
})

app.get('/file', (req, res) => {
    const downloads = fs.readdirSync('/tmp').map(fileName => `<li>
        <a href='/download/${fileName}' download>${fileName}</a>
        <a href='/delete/${fileName}'> x</a>
    </li>`);
    const str = fs.readFileSync('./file.html').toString();
    res.send(str.replace('&&&DOWNLOADS&&&', downloads))
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

app.get('/delete/:path', (req, res) => {
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
    res.sendFile('./editor.html', {root: __dirname })
})

app.get('/pages/:slug', async (req, res) => {
    const template = cache.template || (cache.template = fs.readFileSync(`./template.html`).toString());
    const slug = req.params.slug;
    let body = await fileReader(slug); 
    if (body.ok) {
        const page = template.replace('<!-- %%%BODY%%% -->', body.txt)
        res.send(page);
    } else {
        res.status(400).send(body.txt)
    }
})

app.get('/pages/:slug/edit', async (req, res) => {
    const editor = cache.editor || (cache.editor = fs.readFileSync(`./editor.html`).toString());
    const slug = req.params.slug;
    const pageContent = await fileReader(slug);
    if (pageContent.ok) {
        const page = editor.replace(`/* initialData */`, `initialData: \`${pageContent.txt}\`,`)
        res.send(page);
    } else {
        res.status(400).send(pageContent.txt)
    }
})

app.post('/pages/:slug/save', upload.none(), async (req, res) => {
    const slug = req.params.slug;
    await fileWriter(slug, req.body.content);
    res.send(`page: /${slug} saved`);
})

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})

async function fileReader (slug) {
    const url = `https://${process.env.BUCKET_NAME}.storage.iran.liara.space/pages/${slug}.html`;
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
    const params = {
        Body: content, 
        ACL: "public-read",
        CacheControl: 'max-age=600; public',
        ContentType: 'text/html',
        Bucket: process.env.BUCKET_NAME, 
        Key: `pages/${slug}.html`,
    };
    setCache(slug, null);
    return s3Client.putObject(params).promise();
}