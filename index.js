import express from 'express';
import { config } from "dotenv";
config();

import { question } from './request.js';
import { decrypt } from './crypto.js';
import { readFile } from 'fs/promises';

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

// Route pour retourner la page du front (chat)
app.get('/cards/chat', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Chat API Front</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Styles généraux */
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f9f9f9;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    #chat-container {
      width: 90%;
      max-width: 600px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      height: 80vh;
      padding: 15px;
    }
    #chat-log {
      flex: 1;
      overflow-y: auto;
      margin-bottom: 10px;
    }
    .message {
      margin: 5px 0;
      padding: 8px;
      border-radius: 10px;
    }
    .user-message {
      background: #0000FF;
      color: white;
      align-self: flex-end;
    }
    .bot-message {
      background: white;
      align-self: flex-start;
    }
    #input-container {
      display: flex;
      align-items: center;
    }
    #message-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    #send-btn, #voice-btn, #stop-btn {
      padding: 10px;
      margin-left: 5px;
      border: none;
      background: #0000FF;
      color: white;
      border-radius: 4px;
      cursor: pointer;
    }
    #send-btn:hover, #voice-btn:hover, #stop-btn:hover {
      background: #0000FF;
    }
    /* Bouton Stop Lecture initialement caché */
    #stop-btn {
      display: none;
    }
    /* Style pour le spinner de chargement */
    .spinner {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 10px 0;
    }
    .spinner .dot {
      width: 10px;
      height: 10px;
      background: #0000FF;
      border-radius: 50%;
      margin: 0 5px;
      animation: dotPulse 1s infinite;
    }
    .spinner .dot:nth-child(2) {
      animation-delay: 0.2s;
    }
    .spinner .dot:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes dotPulse {
      0% {
        transform: scale(1);
        opacity: 0.7;
      }
      50% {
        transform: scale(1.5);
        opacity: 1;
      }
      100% {
        transform: scale(1);
        opacity: 0.7;
      }
    }
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="user-info"></div>  
    <div id="chat-log"></div>
    
    <div id="input-container">
      <input type="text" id="message-input" placeholder="Tapez votre question ici..." />
      <button id="voice-btn">🎤</button>
      <button id="send-btn">Envoyer</button>
      <button id="stop-btn">Arrêter Lecture</button>
    </div>
  </div>

  <!-- Chargement de la librairie Marked pour le rendu Markdown -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Variable pour déterminer si la question a été posée par la reconnaissance vocale
      let isVoiceInput = false;
      
      // Génère un identifiant de session unique et constant durant la conversation
      const sessionId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      // Récupère le paramètre "email" depuis l'URL (ex: /chat?email=exemple@mail.com)
      const urlParams = new URLSearchParams(window.location.search);
      const email = urlParams.get('email');
      if (!email) {
        alert("Le paramètre 'email' est requis dans l'URL. Exemple : /chat?email=exemple@mail.com");
        return;
      }
      
    

      fetch(\`/cards/config?email=\${encodeURIComponent(email)}\`)
      .then(response => {
      if (!response.ok) {
      throw new Error("Erreur lors de la récupération de la configuration");
      }
      return response.json();
      })
      .then(config => {
        const userInfo = document.getElementById('user-info');
        userInfo.innerHTML = \`
          <img src="\${config.picture}" alt="Photo de \${config.name}" width="100px"/>
          <div class="info-text">
          <h2>\${config.name}</h2>
          <div class="message bot-message">\${config.invite}</div>
          </div>
      \`;
      })

      const chatLog = document.getElementById('chat-log');
      const messageInput = document.getElementById('message-input');
      const sendBtn = document.getElementById('send-btn');
      const voiceBtn = document.getElementById('voice-btn');
      const stopBtn = document.getElementById('stop-btn');

      // Ajoute l'écouteur d'événement pour arrêter la synthèse vocale lorsqu'on clique sur le bouton Stop
      stopBtn.addEventListener('click', () => {
        speechSynthesis.cancel();
        stopBtn.style.display = 'none';
      });

      // Fonction pour ajouter un message dans le chat
      const appendMessage = (message, className) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + className;
        msgDiv.innerHTML = message;
        chatLog.appendChild(msgDiv);
        chatLog.scrollTop = chatLog.scrollHeight;
      };

      // Fonction pour appeler l'API et afficher une animation durant l'attente
      const callAPI = async (prompt) => {
        try {
          // Ajoute le message de l'utilisateur
          appendMessage(prompt, 'user-message');
          // Ajoute le spinner indiquant le chargement
          const loadingSpinner = document.createElement('div');
          loadingSpinner.className = 'spinner';
          loadingSpinner.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
          chatLog.appendChild(loadingSpinner);
          chatLog.scrollTop = chatLog.scrollHeight;
          
          // Appel à l'API
          const response = await fetch(\`/cards/prompt/?email=\${encodeURIComponent(email)}\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Remplacez 'YOUR_API_KEY' par votre clé d'API si nécessaire
              'x-api-key': 'YOUR_API_KEY'
            },
            body: JSON.stringify({
              prompt: prompt,
              sessionId: sessionId
            })
          });
          
          // Supprime le spinner après réception de la réponse
          chatLog.removeChild(loadingSpinner);

          if (!response.ok) {
            const errorText = await response.text();
            appendMessage('Erreur: ' + errorText, 'bot-message');
            return;
          }
          const markdownResponse = await response.text();
          // Convertit le markdown en HTML pour l'affichage
          const htmlResponse = marked.parse(markdownResponse);
          appendMessage(htmlResponse, 'bot-message');
          
          // Si la question a été posée par speech-to-text, on lance la synthèse vocale
          if (isVoiceInput) {
            const cleanText = markdownResponse
                                .replace(/https?:\\/\\/\\S+/g, '')
                                .replace(/\\*/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanText);
            // Lorsque la lecture se termine, on masque le bouton Stop
            utterance.onend = () => {
              stopBtn.style.display = 'none';
            };
            // Affiche le bouton Stop et démarre la lecture
            stopBtn.style.display = 'inline-block';
            speechSynthesis.speak(utterance);
          }
        } catch (error) {
          const spinnerElem = document.querySelector('.spinner');
          if (spinnerElem) spinnerElem.remove();
          appendMessage('Erreur: ' + error.message, 'bot-message');
        }
      };

      // Envoie du message lors du clic sur le bouton "Envoyer"
      sendBtn.addEventListener('click', () => {
        // Pour une question tapée, on ne fait pas de TTS
        isVoiceInput = false;
        const prompt = messageInput.value.trim();
        if (prompt) {
          callAPI(prompt);
          messageInput.value = '';
        }
      });

      // Envoi du message avec la touche "Entrée"
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendBtn.click();
        }
      });

      // Mise en place de la reconnaissance vocale (Web Speech API)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.interimResults = true; // Pour récupérer les résultats intermédiaires
        recognition.continuous = true;     // On gère nous-même la fin grâce à un timer
        recognition.maxAlternatives = 1;
        
        let recordingTranscript = '';
        let silenceTimer = null;
        
        recognition.onstart = () => {
          // Change la couleur du bouton pendant l'enregistrement
          voiceBtn.style.background = 'red';
          recordingTranscript = '';
          messageInput.value = '';
        };
        
        recognition.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              recordingTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          messageInput.value = recordingTranscript + interimTranscript;
          
          // Réinitialise le timer à chaque nouveau résultat
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            const finalText = messageInput.value.trim();
            if (finalText !== '') {
              // Pour une question issue de la reconnaissance vocale, on active le TTS
              isVoiceInput = true;
              callAPI(finalText);
              messageInput.value = '';
            }
            recognition.stop();
            voiceBtn.style.background = '#0000FF';
          }, 1000);
        };
        
        recognition.onerror = (event) => {
          console.error('Erreur de reconnaissance vocale:', event.error);
          voiceBtn.style.background = '#0000FF';
        };
        
        recognition.onend = () => {
          voiceBtn.style.background = '#0000FF';
        };
        
        voiceBtn.addEventListener('click', () => {
          recordingTranscript = '';
          messageInput.value = '';
          recognition.start();
        });
      } else {
        voiceBtn.disabled = true;
        voiceBtn.title = 'Reconnaissance vocale non supportée par votre navigateur';
      }
    });
  </script>
</body>
</html>`);
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