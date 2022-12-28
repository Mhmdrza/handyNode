
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const port = 8080;
const upload = multer();
const app = express();
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    const downloads = fs.readdirSync('/tmp').map(fileName => `<li>
    <a href='/download/${fileName}'>${fileName}</a>
    <a href='/delete/${fileName}'> x</a>
    </li>`)
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
                <form action='/upload' method='post' enctype='multipart/form-data' class='mx-auto'>
                    <input type='file' name='file' />
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
    const id = Date.now().toString() + '.' + req.file.originalname;
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

app.listen(port, () => {
    console.log(`Handy app listening on port ${port}`)
})