import crypto from 'crypto';
import { config } from "dotenv";
import fs from 'fs';
import path from 'path';
config();

const algorithm = 'aes-256-cbc';

function bufferToString(buffer) {
    return buffer.toString('utf-8');
}

function stringToBuffer(string) {
    return Buffer.from(string, 'utf-8');
}

function encodeBase64(buffer) {
    return buffer.toString('base64');
}

function decodeBase64(base64String) {
    return Buffer.from(base64String, 'base64');
}

function encryptEmail(email,key,iv) {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(email, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }
  
  function encodeForUrl(encryptedEmail) {
    return encodeURIComponent(encryptedEmail);
  }
  

  function decryptEmail(encryptedEmail,key,iv) {
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedEmail, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }


async function main () {

    console.log ("create key")
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32); // Clé de 256 bits
    const iv = crypto.randomBytes(16); // Vecteur d'initialisation de 16 octets
    console.log (key)
    console.log (iv)
    
    let k = encodeBase64(key)
    let i = encodeBase64(iv)
    
    console.log ("---clefs a mettre dans le .env -----")
    console.log (k)
    console.log (i)
    console.log ("--- check-----")
    console.log (decodeBase64(k))
    console.log (decodeBase64(i))

    console.log ("======== DIRECTORIES ========")
    listEmailsAndEncrypt (path.join(process.env.FILES,"mails"))
    /*
    const email = "yves-marie.pondaven@docaposte.fr"
    const encryptedEmail = encryptEmail(email,key,iv);
    const encodedEmail = encodeForUrl(encryptedEmail);

    console.log('Email chiffré:', encryptedEmail);
    console.log('Email encodé pour URL:', encodedEmail);


    const decryptedEmail = decryptEmail(decodeURIComponent(encryptedEmail),key,iv);
    console.log (">>>>>>>>>>>>\n\n")

    console.log (">>>>>>>>>>>>>>>>>>>>>>>>>>>>>dechiffré :",decryptedEmail)
    */
    function listEmailsAndEncrypt(directoryPath) {
        const key = decodeBase64(process.env.KEY);
        const iv = decodeBase64(process.env.IV);
      
        fs.readdir(directoryPath, (err, files) => {
          if (err) {
            console.error('Error reading directory:', err);
            return;
          }
      
          files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            fs.stat(filePath, (err, stats) => {
              if (err) {
                console.error('Error reading file stats:', err);
                return;
              }
      
              if (stats.isDirectory()) {
                const email = file;
                const encryptedEmail = encryptEmail(email, key, iv);
                console.log(`Email: ${email} anf encrpyred ${encodeURIComponent(encryptedEmail)}`);
            
              }
            });
          });
        });
      }

}


export async function cryp (email) {
    let key = process.env.KEY
    let iv=process.env.IV
    console.log (key,iv)
    return encryptEmail(email,decodeBase64(key),decodeBase64(iv))
}

export  async function decrypt (email) {
    let key = process.env.KEY
    let iv= process.env.IV
    return decryptEmail(email,decodeBase64(key),decodeBase64(iv))
}

main()
