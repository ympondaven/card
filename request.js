import { config } from "dotenv";
config();
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { SystemMessagePromptTemplate,HumanMessagePromptTemplate,AIMessagePromptTemplate} from "@langchain/core/prompts";
import { RunnableSequence,RunnablePassthrough ,RunnableMap} from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import * as fs from 'fs';
import * as path from 'path';

import { Document } from 'langchain/document';
import { loadQAMapReduceChain } from "langchain/chains";
import { AzureChatOpenAI } from "@langchain/openai";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { createClient } from 'redis';

const redisClient = createClient({
url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  redisClient.on('error', (err) => console.error("Redis Client Error", err));
  

const llm = new AzureChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
    maxTokens: 4000,
    maxRetries: 2,
    verbose: false,
    streaming: true, // Pour que handleLLMNewToken soit appelé à chaque token
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });

  let embeddings = new AzureOpenAIEmbeddings(  {
    "temperature": 0.1,
    "azureOpenAIApiKey": process.env.AZURE_OPENAI_API_KEY,
    "azureOpenAIApiVersion": "2024-06-01",
    "azureOpenAIApiInstanceName": process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    "azureOpenAIApiDeploymentName": "text-embedding-3-large",
    "maxConcurrency": 50
  })
  

  const SYSTEM_TEMPLATE = `Tu es l'avatar de la personne indiquée. Tu as acces aux documents décrivant cette personne et les offres commerciales qu'elle porte. Tu fais des réponses en son nom. Donc tu réponds je suis né ... comme si tu étais cette perssonne. Utilisez les informations suivantes pour répondre à la question ci-dessous. Si vous ne connaissez pas la réponse, indiquez-le clairement. Dans votre réponse, incluez les sources et les éléments pour aider l'utilisateur à les retrouver, comme le numéro de page et le nom du document. Structurez votre réponse de manière claire et logique.
    ----------------
    {context}
    ----------------
    Question : {question}
    Réponse :`;

import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { randomUUID } from "crypto";



export async function question (context, card, question ) {
  try {
    let cardDirectory = path.join (process.env.FILES, "vectors" , card)
    
    let sessionId = `session:${context.sessionId}:history`
    let raw_history = await redisClient.get(sessionId)
    console.log ("raw_history", raw_history)
    let history = raw_history!=undefined ? JSON.parse(raw_history) : [] // JSON.parse (raw_history)
    console.log ("history", history)

    const loadedVectorStore = await FaissStore.load( cardDirectory, embeddings);        
    let vectorStoreRetriever = loadedVectorStore.asRetriever({ metadata: { title: true, source: true, tags: true },  });
    const messages = [
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE+ " \ntu es l avatar de : " + card),
      HumanMessagePromptTemplate.fromTemplate("{question}"),
    ];

    for (const historyItem of history) {
        messages.push (HumanMessagePromptTemplate.fromTemplate(historyItem.question))
        messages.push (AIMessagePromptTemplate.fromTemplate(historyItem.response))
    }
    
    messages.push (HumanMessagePromptTemplate.fromTemplate(question))
    const prompt = ChatPromptTemplate.fromMessages(messages);
    
    const ragChainFromDocs = RunnableSequence.from([
        RunnablePassthrough.assign({
          context: (input) => formatDocumentsAsString(input.context) ,
        }),
        prompt,
        llm
      ]);
      let ragChainWithSource = new RunnableMap({
        steps: { context: vectorStoreRetriever, question: new RunnablePassthrough() },
      });
    ragChainWithSource = ragChainWithSource.assign({ answer: ragChainFromDocs });
    const response = await ragChainWithSource.invoke(question);

    console.log ("response.anwser", response.answer.content )
    history.push ({ question:question, response:response.answer.content })
    console.log (history)
    //redisClient.set(sessionId, JSON.stringify(history));
    await redisClient.set(sessionId, JSON.stringify(history), {
        EX: 60*60*12
      });

    return response.answer.content
  } catch (err) {
    console.error (err)
    return "desole ca n a pas marche"
  }
}

async function main () {

    await redisClient.connect();

}

/*
async function main () {

    await redisClient.connect();

    let sessionId = randomUUID()
    console.log ("-----------------------------------------------------")
    let r = await question ({ "ip" : "0.0.0.0" , sessionId : sessionId }, "yves-marie.pondaven@docaposte.fr", "quel est le prénom de cette personne ?")
    console.log(r)
    console.log ("-----------------------------------------------------")
    let r2 = await question ({ "ip" : "0.0.0.0" , sessionId : sessionId }, "yves-marie.pondaven@docaposte.fr", "et son nom  ?")
    console.log (r2)
    console.log ("-----------------------------------------------------")
    let r3 = await question ({ "ip" : "0.0.0.0" , sessionId : sessionId }, "yves-marie.pondaven@docaposte.fr", "quelles sont les expériences ?")
    console.log (r3)
    console.log ("-----------------------------------------------------")
}*/

main ()