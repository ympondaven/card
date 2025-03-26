import express from 'express';
import { config } from "dotenv";


config();
import { question } from './request.js';
import { decrypt} from './crypto.js';

const app = express();
app.use(express.json());

const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!process.env.API_KEYS.split(',').includes(apiKey)) {
        console.log ("apiKeyAuth Unauthorized", apiKey)
        return res.status(401).send('Unauthorized');
    }
    next();
  };
  app.use(apiKeyAuth);

  app.post('/cards/prompt/:id', async (req, res) => {
    try {
        console.log('/cards/prompt/:id')  
        const { prompt, sessionId }  = req.body

        console.log (decrypt(req.params.id), prompt)
        let reponse = await question ({ sessionId:sessionId }, await decrypt(decodeURIComponent(req.params.id)), prompt)
        res.send(reponse)

    } catch (error) {
        console.log (error)
      res.status(500).send(error.message);
    }
  });




const PORT = process.env.PORT || 1515;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});