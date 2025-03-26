import { config } from 'dotenv';
config();
console.log (process.env.AZURE_OPENAI_API_KEY)
import fs from 'fs';
import path from 'path';
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { AzureOpenAIEmbeddings } from "@langchain/openai";

const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-3-large",
      maxConcurrency: 3
});

// Extensions supportées pour le chargement
const supportedExtensions = ['.pdf', '.docx', '.doc', '.json', '.txt', '.csv', '.ppt', '.pptx'];

/**
 * Charge les documents d'un fichier en fonction de son extension.
 *
 * @param {string} filePath - Chemin complet du fichier.
 * @returns {Promise<Array>} Un tableau de documents.
 */
async function loadDocumentsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const loaders = {
    ".pdf": (filePath) => new PDFLoader(filePath, { splitPages: true }),
    ".docx": (filePath) => new DocxLoader(filePath),
    ".doc": (filePath) => new DocxLoader(filePath),
    ".json": (filePath) => new JSONLoader(filePath, "/texts"),
    ".txt": (filePath) => new TextLoader(filePath),
    ".csv": (filePath) => new CSVLoader(filePath),
    ".ppt": (filePath) => new PPTXLoader(filePath),
    ".pptx": (filePath) => new PPTXLoader(filePath),
  };

  const loaderFunction = loaders[ext];
  if (!loaderFunction) {
    console.log(`Extension non supportée pour le fichier ${filePath}`);
    return [];
  }

  try {
    const loaderInstance = loaderFunction(filePath);
    const docs = await loaderInstance.load();
    return docs;
  } catch (err) {
    console.error(`Erreur lors du chargement du fichier ${filePath}:`, err);
    return [];
  }
}

/**
 * Traite un répertoire d'email :
 * - Parcourt tous les fichiers du répertoire.
 * - Charge les documents pour chaque fichier supporté.
 * - Divise le texte en morceaux.
 * - Crée le vector store et le sauvegarde dans le répertoire dédié (une base par email).
 *
 * @param {string} emailDirPath - Chemin du répertoire de l'email.
 * @param {string} vectorsDir - Chemin du répertoire où sauvegarder les vector stores.
 */
async function processEmailDirectory(emailDirPath, vectorsDir) {
  try {
    // Récupérer le nom du répertoire (souvent l'email)
    const emailName = path.basename(emailDirPath);
    
    // Collection de tous les documents dans le répertoire
    let allDocs = [];
    const files = await fs.promises.readdir(emailDirPath);

    for (const file of files) {
      const fullPath = path.join(emailDirPath, file);
      const stats = await fs.promises.stat(fullPath);
      if (stats.isFile()) {
        if (supportedExtensions.includes(path.extname(fullPath).toLowerCase())) {
          console.log(`Traitement du fichier : ${fullPath}`);
          const docs = await loadDocumentsFromFile(fullPath);
          if (docs.length > 0) {
            allDocs = allDocs.concat(docs);
          }
        } else {
          console.log(`Fichier non traité (extension non supportée) : ${file}`);
        }
      }
    }

    if (allDocs.length === 0) {
      console.warn(`Aucun document trouvé dans le répertoire ${emailDirPath}.`);
      return;
    }

    // Découper les textes en morceaux
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const splittedDocs = await splitter.splitDocuments(allDocs);
    console.log(`Nombre de chunks pour ${emailName} : ${splittedDocs.length}`);

    // Création du vector store à partir des documents découpés.
    // Ici, nous utilisons la méthode fromDocuments qui crée directement le vector store.
    let vectorStore = await FaissStore.fromDocuments(splittedDocs, embeddings);

    // Définir le chemin pour sauvegarder la base vectorielle de cet email
    const vectorStorePath = path.join(vectorsDir, emailName);
    // Si le répertoire existe déjà, le supprimer pour le remplacer par la nouvelle base.
    if (fs.existsSync(vectorStorePath)) {
      fs.rmSync(vectorStorePath, { recursive: true, force: true });
      console.log(`Répertoire vectoriel existant supprimé : ${vectorStorePath}`);
    }
    await vectorStore.save(vectorStorePath);
    console.log(`Base vectorielle de ${emailName} sauvegardée dans ${vectorStorePath}`);
  } catch (err) {
    console.error(`Erreur lors du traitement du répertoire ${emailDirPath} :`, err);
  }
}

/**
 * Fonction principale :
 * - Récupère le répertoire racine (ex: card) en argument.
 * - Vérifie l'existence des répertoires "mails" et "vectors".
 * - Traite chaque sous-répertoire email.
 */
async function main() {
  // Le répertoire "card" doit être passé en argument (ex: node indexMails.js card)
/*
  const rootDirectory = process.argv[2];
  if (!rootDirectory) {
    console.error("Usage : node indexMails.js <répertoire_card>");
    process.exit(1);
  }
*/
    const rootDirectory = process.env.FILES

  const mailsDir = path.join(rootDirectory, "mails");
  const vectorsDir = path.join(rootDirectory, "vectors");

  // Vérifier l'existence du répertoire "mails"
  if (!fs.existsSync(mailsDir)) {
    console.error(`Le répertoire "mails" n'existe pas dans ${rootDirectory}`);
    process.exit(1);
  }

  // Créer le répertoire "vectors" s'il n'existe pas
  if (!fs.existsSync(vectorsDir)) {
    fs.mkdirSync(vectorsDir, { recursive: true });
  }

  // Pour chaque répertoire dans "mails" (chaque nom de répertoire correspond à un email)
  const emailDirs = fs
    .readdirSync(mailsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const emailDirName of emailDirs) {
    const emailDirPath = path.join(mailsDir, emailDirName);
    console.log(`\n=== Traitement du répertoire email : ${emailDirName} ===`);
    await processEmailDirectory(emailDirPath, vectorsDir);
  }

  console.log("\nTraitement terminé.");
}

main();