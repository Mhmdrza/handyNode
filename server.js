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
})

const s3Client = new AWS({
    endpoint: process.env.ENDPOINT,
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
    region: "default",
    s3ForcePathStyle: true,
});



const cache = Object.create(null);

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
    let body = await fileReader(req.params.slug); 
    const page = template.replace('<!-- %%%BODY%%% -->', body)
    res.send(page);
})

app.get('/pages/:slug/edit', async (req, res) => {
    const editor = cache.editor || (cache.editor = fs.readFileSync(`./editor.html`).toString());
    const pageContent = await fileReader(req.params.slug)
    const page = editor.replace(`/* initialData */`, `initialData: \`${pageContent}\`,`)
    res.send(page);
})

app.post('/pages/:slug/save', upload.none(), async (req, res) => {
    const slug = req.params.slug;
    const t = await fileWriter(slug, req.body.content);
    res.send(`page: /${slug} saved`);
})

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})

async function fileReader (slug) {
    const url = `https://cdn2.storage.iran.liara.space/pages/${slug}.html`;
    return fetch(url).then(res => res.ok && res.text());
    // let fileString;
    // try {
    //     fileString = fs.readFileSync(`./pages/${slug}.html`).toString();
    // } catch (error) {
    //     fileString = fs.readFileSync(`/tmp/${slug}.html`).toString();
    // }
    // return fileString;
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
    return s3Client.putObject(params).promise();
}