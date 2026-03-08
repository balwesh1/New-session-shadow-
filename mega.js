import * as mega from 'megajs';

const auth = {
    email: 'balwesh78@gmail.com',
    password: 'Oumou528@78',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 WhatsApp/2.2412.54'
};

export const upload = (data, name) => new Promise((resolve, reject) => {
    try {
        const storage = new mega.Storage(auth, () => {
            const uploadStream = storage.upload({ name, allowUploadBuffering: true });
            data.pipe(uploadStream);
            storage.on("add", (file) => {
                file.link((err, url) => {
                    if (err) reject(err);
                    else { storage.close(); resolve(url); }
                });
            });
            storage.on("error", reject);
        });
    } catch (err) { reject(err); }
});

export const download = (url) => new Promise((resolve, reject) => {
    try {
        const file = mega.File.fromURL(url);
        file.loadAttributes((err) => {
            if (err) return reject(err);
            file.downloadBuffer((err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    } catch (err) { reject(err); }
});