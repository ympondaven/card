

import { config } from "dotenv";
config();
import axios from 'axios'
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { SystemMessagePromptTemplate,HumanMessagePromptTemplate} from "@langchain/core/prompts";
import { RunnableSequence,RunnablePassthrough ,RunnableMap} from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import * as fs from 'fs';
import * as path from 'path';

import { Document } from 'langchain/document';
import { loadQAMapReduceChain } from "langchain/chains";
import { AzureChatOpenAI } from "@langchain/openai";
import { AzureOpenAIEmbeddings } from "@langchain/openai";


import axiosRetry from 'axios-retry';
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
  return retryCount * 1000;
  },
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response && error.response.status >= 500);
  }
});

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
  

  const SYSTEM_TEMPLATE = `Utilisez les informations suivantes pour répondre à la question ci-dessous. Si vous ne connaissez pas la réponse, indiquez-le clairement. Dans votre réponse, incluez les sources et les éléments pour aider l'utilisateur à les retrouver, comme le numéro de page et le nom du document. Structurez votre réponse de manière claire et logique.
    ----------------
    {context}
    ----------------
    Question : {question}
    Réponse :`;

import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";



export async function question (context, card, question ) {
  try {
    let cardDirectory = path.join (process.env.FILES, "vectors" , card)
    console.log ("cardDirectory", cardDirectory)
    
    const loadedVectorStore = await FaissStore.load( cardDirectory, embeddings);        
    let vectorStoreRetriever = loadedVectorStore.asRetriever({ metadata: { title: true, source: true, tags: true },  });
    const messages = [
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
      HumanMessagePromptTemplate.fromTemplate("{question}"),
    ];
    const prompt = ChatPromptTemplate.fromMessages(messages);
    
    const ragChainFromDocs = RunnableSequence.from([
        RunnablePassthrough.assign({
          context: (input) => formatDocumentsAsString(input.context),
        }),
        prompt,
        llm
      ]);
      let ragChainWithSource = new RunnableMap({
        steps: { context: vectorStoreRetriever, question: new RunnablePassthrough() },
      });
    ragChainWithSource = ragChainWithSource.assign({ answer: ragChainFromDocs });
    const response = await ragChainWithSource.invoke(question);      
    return response
  } catch (err) {
    console.error (err)
    return "desole ca n a pas marche"
  }
}


async function main () {
    let r = await question ({ "ip" : "0.0.0.0" , sessionid : "42" }, "yves-marie.pondaven@docaposte.fr", "quel est le prénom de cette personne ?")
    console.log (r)
}

main ()