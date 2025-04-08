import { config } from "dotenv";
config();
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { SystemMessagePromptTemplate, HumanMessagePromptTemplate, AIMessagePromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnablePassthrough, RunnableMap } from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import * as path from "path";
import { existsSync , readFileSync} from 'fs';
import { AzureChatOpenAI } from "@langchain/openai";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
redisClient.on("error", (err) => console.error("Redis Client Error", err));

const llm = new AzureChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  maxTokens: 4000,
  maxRetries: 2,
  verbose: false,
  streaming: true,
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

let embeddings = new AzureOpenAIEmbeddings({
  temperature: 0.1,
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiVersion: "2024-06-01",
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
  azureOpenAIApiDeploymentName: "text-embedding-3-large",
  maxConcurrency: 50,
});

const SYSTEM_TEMPLATE = `Tu es l'avatar de la personne indiquée.
 Tu as accès aux documents décrivant cette personne et les offres commerciales qu'elle porte. 
 Tu fais des réponses en son nom. Donc tu réponds "je suis né ..." comme si tu étais cette personne. 
 Ne réponds qu'avec les informations de ton contexte. Utilisez les informations suivantes pour répondre à la question ci-dessous. 
 Si vous ne connaissez pas la réponse, indiquez-le clairement. 
 Il faut etre poli mais dans une conversation donc on dit bonjour au debut et au revoir a la fin mais pas a la fin de chaque réponse.ne dit aurevoir ou a bientot que si l'utilisateur te dit aurevoir. 
  tu ne dis pas au revoir tant que l'on ne te dit pas aurevoir. L'utilisateur peut te reposer une question, ca serait impoli. 
  Quand on te dit bonjour sans question tu peux proposer que voulez vous avoir sur moi ou sur les offres docaposte.
----------------
{context}
----------------
Question : {question}
Réponse :`;

import { ChatPromptTemplate } from "@langchain/core/prompts";

export async function question(context, card, question) {
  try {
    const cardDirectory = path.join(process.env.FILES, "vectors", card);

    // Extraction du domaine de l'e-mail
    console.log (card)
    const emailDomain = card.split("@")[1]?.toLowerCase();
    const domainDirectory = path.join(process.env.FILES, "web", emailDomain);

    // Chargement de la base vectorielle principale (carte)
    const loadedCardVectorStore = await FaissStore.load(cardDirectory, embeddings);

    // Fusion avec la base vectorielle correspondant au domaine, si elle existe
    if (existsSync(domainDirectory)) {
      const domainVectorStore = await FaissStore.load(domainDirectory, embeddings);
      // await newStore.mergeFrom(initialStore);
      await loadedCardVectorStore.mergeFrom(domainVectorStore);
      console.log(`Merged vector store with domain vector store: ${emailDomain}, ${domainDirectory}`);
    } else {
        console.log(`NO vector store with domain vector store: ${emailDomain}, ${domainDirectory}`);
    }
    const vectorStoreRetriever = loadedCardVectorStore.asRetriever({
      metadata: { title: true, source: true, tags: true },
    });

    const sessionId = `session:${context.sessionId}:history`;
    const raw_history = await redisClient.get(sessionId);
    const history = raw_history ? JSON.parse(raw_history) : [];


    const cv = readFileSync(path.join(process.env.FILES, "mails", card, "prompt.txt"), 'utf-8');
    const messages = [
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE + " \ntu es l'avatar de : " + card + "et voici son CV :  "+ cv + "\n\n utilise ne priorité ces informations pour repondre aux questions sur " + card ),
      HumanMessagePromptTemplate.fromTemplate("{question}"),
    ];

    for (const historyItem of history) {
      messages.push(HumanMessagePromptTemplate.fromTemplate(historyItem.question));
      messages.push(AIMessagePromptTemplate.fromTemplate(historyItem.response));
    }

    messages.push(HumanMessagePromptTemplate.fromTemplate(question));
    const prompt = ChatPromptTemplate.fromMessages(messages);

    const ragChainFromDocs = RunnableSequence.from([
      RunnablePassthrough.assign({
        context: (input) => formatDocumentsAsString(input.context),
      }),
      prompt,
      llm,
    ]);

    let ragChainWithSource = new RunnableMap({
      steps: { context: vectorStoreRetriever, question: new RunnablePassthrough() },
    });
    ragChainWithSource = ragChainWithSource.assign({ answer: ragChainFromDocs });

    const response = await ragChainWithSource.invoke(question);

    console.log("response.answer", response.answer.content);
    history.push({ question: question, response: response.answer.content });
    //console.log(history);

    await redisClient.set(sessionId, JSON.stringify(history), { EX: 60 * 60 * 12 }); // Cache de 12h
    return response.answer.content;
  } catch (err) {
    console.error(err);
    return "Désolé, ça n'a pas marché.";
  }
}

async function main() {
  await redisClient.connect();
  //console.log ("qestion")
  //console.log (await question({"email":"yves-marie.pondaven@docaposte.fr",sessionId:'80'}, "yves-marie.pondaven@docaposte.fr", "tu as travaillé pour qtées ?ell soctées ?"))
}

main();