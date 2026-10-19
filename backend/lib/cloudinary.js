const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  // No Vercel/Cloudinary sem API_KEY e API_SECRET usando apenas upload_preset (Unsigned), 
  // a abordagem ideal via backend ainda pede as chaves de API, mas podemos forçar o upload.
});

// Função para fazer upload do Buffer do PDF
function uploadPdfBuffer(buffer, fileName) {
  return new Promise((resolve, reject) => {
    let cld_upload_stream = cloudinary.uploader.upload_stream(
      { 
        folder: "certificados", 
        public_id: fileName,
        resource_type: "raw", // "raw" é necessário para PDFs
        upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(cld_upload_stream);
  });
}

module.exports = { uploadPdfBuffer };