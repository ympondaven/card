import express from 'express';
import { config } from "dotenv";
config();

import { question } from './request.js';
import { decrypt } from './crypto.js';
import { readFile } from 'fs/promises';

import path from 'path';
import { fileURLToPath } from 'url';

// Définir __dirname avec ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Middleware pour vérifier la clé d'API (désactivé dans cet exemple)
// const apiKeyAuth = (req, res, next) => {
//   const apiKey = req.headers['x-api-key'];
//   if (!process.env.API_KEYS.split(',').includes(apiKey)) {
//     console.log("apiKeyAuth Unauthorized", apiKey);
//     return res.status(401).send('Unauthorized');
//   }
//   next();
// };
// app.use(apiKeyAuth);

// Route pour récupérer la configuration utilisateur
app.get('/cards/config', async (req, res) => {
  try {
    if (!req.query.email) {
      return res.status(400).send("Le paramètre 'email' est requis dans l'URL");
    }
    // Déchiffrement de l'email
    const email = await decrypt(req.query.email);
    const filePath = `${process.env.FILES}/mails/${email}/config.json`;
    
    // Lecture du fichier de configuration
    const configFile = await readFile(filePath, 'utf8');
    const configData = JSON.parse(configFile);
    
    res.json(configData);
  } catch (error) {
    console.error('Erreur lors de la récupération de la configuration:', error);
    if (error.code === 'ENOENT') {
      res.status(404).send("Configuration non trouvée pour l'utilisateur");
    } else {
      res.status(500).send("Erreur lors de la récupération de la configuration");
    }
  }
});

// Route pour la gestion du prompt
app.post('/cards/prompt/', async (req, res) => {
  try {
    const { prompt, sessionId } = req.body;
    console.log('/cards/prompt/', sessionId);

    // Récupère l'e-mail dans la query et le décrypte
    const email = await decrypt(req.query.email);
    console.log(email, prompt);
    let reponse = await question({ sessionId: sessionId }, email, prompt);
    // La fonction question doit renvoyer le markdown
    res.send(reponse);
  } catch (error) {
    console.log(error);
    res.status(500).send(error.message);
  }
});

// Route pour retourner la page du front (chat) en servant le fichier HTML statique
app.get('/cards/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Gestion de toutes les autres routes non définies
app.use((req, res) => {
  console.log(`URL non définie appelée : ${req.originalUrl}`);
  res.status(404).send('Route non définie');
});

const PORT = process.env.PORT || 1515;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});