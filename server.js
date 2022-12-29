
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const port = 8080;
const upload = multer();
const app = express();
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    const downloads = fs.readdirSync('/tmp').map(fileName => `<li>
        <a href='/download/${fileName}' download>${fileName}</a>
        <a href='/delete/${fileName}'> x</a>
    </li>`);

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <style>
                    .flex {display: flex}
                    .flex-column {flex-direction: column}
                    .aic {align-items: center}
                    .mx-auto {margin-right: auto; margin-left: auto}
                </style>
            </head>
            <body class='flex flex-column aic'>
                <h1>Upload file</h1>
                <form action='/upload' method='post' enctype='multipart/form-data' class=''>
                    <input type='file' name='file' required />
                    <button type='submit'>upload</button>
                </form>
                <h2>Files on server:</h2>
                <ul>
                    ${downloads}
                </ul>
            </body>
        </html>
    `)
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

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})