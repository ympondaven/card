import { config } from 'dotenv';
config();
import fs from 'fs';
import path from 'path';
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RecursiveUrlLoader } from "@langchain/community/document_loaders/web/recursive_url";
import { compile } from "html-to-text";
import { AzureOpenAIEmbeddings } from "@langchain/openai";

const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-3-large",
      maxConcurrency: 3
});

const domains = process.env.DOMAINS.split(',');

/**
 * Charge les documents d'un site web.
 *
 * @param {string} url - URL du site web.
 * @returns {Promise<Array>} Un tableau de documents.
 */
async function loadDocumentsFromWeb(url) {
  try {
    const compiledConvert = compile({ wordwrap: 130 }); // returns (text: string) => string;
    const loader = new RecursiveUrlLoader(url, {
      extractor: compiledConvert,
      maxDepth: 5,
      excludeDirs: ["/docs/api/"],
    });
    const docs = await loader.load();
    return docs;
  } catch (err) {
    console.error(`Erreur lors du chargement du site web ${url}:`, err);
    return [];
  }
}

/**
 * Traite un domaine :
 * - Charge les documents pour chaque site web du domaine.
 * - Divise le texte en morceaux.
 * - Crée le vector store et le sauvegarde dans le répertoire dédié.
 *
 * @param {string} domain - Nom du domaine.
 * @param {Array} sites - Liste des sites web du domaine.
 * @param {string} vectorsDir - Chemin du répertoire où sauvegarder les vector stores.
 */
async function processDomain(domain, sites, vectorsDir) {
  try {
    let allDocs = [];
    for (const site of sites) {
      console.log(`Traitement du site : ${site}`);
      const docs = await loadDocumentsFromWeb(site);
      if (docs.length > 0) {
        allDocs = allDocs.concat(docs);
      }
    }

    if (allDocs.length === 0) {
      console.warn(`Aucun document trouvé pour le domaine ${domain}.`);
      return;
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const splittedDocs = await splitter.splitDocuments(allDocs);
    console.log(`Nombre de chunks pour ${domain} : ${splittedDocs.length}`);

    let vectorStore = await FaissStore.fromDocuments(splittedDocs, embeddings);

    const vectorStorePath = path.join(vectorsDir, domain);
    if (fs.existsSync(vectorStorePath)) {
      fs.rmSync(vectorStorePath, { recursive: true, force: true });
      console.log(`Répertoire vectoriel existant supprimé : ${vectorStorePath}`);
    }
    await vectorStore.save(vectorStorePath);
    console.log(`Base vectorielle de ${domain} sauvegardée dans ${vectorStorePath}`);
  } catch (err) {
    console.error(`Erreur lors du traitement du domaine ${domain} :`, err);
  }
}

/**
 * Fonction principale :
 * - Récupère les domaines et leurs sites web depuis le fichier de configuration.
 * - Traite chaque domaine.
 */
async function main() {
  const vectorsDir = path.join(process.env.FILES, "web");

  if (!fs.existsSync(vectorsDir)) {
    fs.mkdirSync(vectorsDir, { recursive: true });
  }

  for (const domain of domains) {
    const sites = process.env[domain].split(',');
    console.log(`\n=== Traitement du domaine : ${domain} ===`);
    await processDomain(domain, sites, vectorsDir);
  }

  console.log("\nTraitement terminé.");
}

main();