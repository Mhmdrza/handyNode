
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const port = 8080;
const upload = multer();
const app = express();
app.use(express.urlencoded({ extended: true }));


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

app.get('/pages/:slug', (req, res) => {
    const template = fs.readFileSync(`./template.html`).toString();
    const body = fs.readFileSync(`./pages/${req.params.slug}.html`).toString();
    const page = template.replace('<!-- %%%BODY%%% -->', body)
    res.send(page);
})

app.get('/pages/:slug/edit', (req, res) => {
    const editor = fs.readFileSync(`./editor.html`).toString();
    let pageContent; 
    try {
        pageContent = fs.readFileSync(`./pages/${req.params.slug}.html`).toString();
    } catch (error) {
        pageContent = fs.readFileSync(`/tmp/${req.params.slug}.html`).toString();
    }
    const page = editor.replace(`/* initialData */`, `initialData: \`${pageContent}\`,`)
    res.send(page);
})

app.post('/pages/:slug/save', upload.none(), (req, res) => {
    const slug = req.params.slug;
    try {
        fs.writeFileSync(`./pages/${slug}.html`, req.body.content, 'utf8')
    } catch (error) {
        fs.writeFileSync(`/tmp/${slug}.html`, req.body.content, 'utf8')
    }
    res.send(`page: /${slug} saved`);
})

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})