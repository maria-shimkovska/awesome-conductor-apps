import {
  orkesConductorClient,
  TaskManager,
} from '@io-orkes/conductor-javascript';

import { createHealthcareProviderFinderAgent } from '../LangChainAgents/DoctorFinder.js';
import { createMedicalEmailDrafterAgent } from '../LangChainAgents/EmailDrafter.js';
import { createDutchHealthcareNavigatorAgent } from '../LangChainAgents/MedicalSystemNavigator.js';
import { createPrescriptionTransitionManagerAgent } from '../LangChainAgents/PrescriptionTransitionManager.js';

import 'dotenv/config';

const agent = createHealthcareProviderFinderAgent();
const drafterAgent = createMedicalEmailDrafterAgent();
const medicialSystemNavigatorAgent = createDutchHealthcareNavigatorAgent();
const prescriptionTransitionManagerAgent =
  createPrescriptionTransitionManagerAgent();

const healthcareProviderFinderWorker = {
  taskDefName: 'healthcare_provider_finder',
  execute: async (task) => {
    try {
      // Get query from Conductor input
      const query = task.inputData?.query;

      if (!query) {
        return {
          outputData: {
            error: 'No query provided',
            response: null,
          },
          status: 'FAILED_WITH_TERMINAL_ERROR',
          reasonForIncompletion: 'Missing required input: query',
        };
      }

      // Run agent with the query from Conductor
      const result = await agent.invoke({
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });

      const response = result.messages[result.messages.length - 1].content;

      const toolsUsed = result.messages
        .filter((msg) => msg.tool_calls && msg.tool_calls.length > 0)
        .flatMap((msg) => msg.tool_calls.map((tc) => tc.name));

      return {
        outputData: {
          response: response,
          toolsUsed: toolsUsed,
          messageCount: result.messages.length,
        },
        status: 'COMPLETED',
      };
    } catch (error) {
      return {
        outputData: { error: error.message, response: null },
        status: 'FAILED',
        reasonForIncompletion: `Agent execution failed: ${error.message}`,
      };
    }
  },
};

const prescriptionTransitionManagerAgentWorker = {
  taskDefName: 'prescription_transition_manager',
  execute: async (task) => {
    try {
      // Get query from Conductor input
      const query = task.inputData?.query;

      if (!query) {
        return {
          outputData: {
            error: 'No query provided',
            response: null,
          },
          status: 'FAILED_WITH_TERMINAL_ERROR',
          reasonForIncompletion: 'Missing required input: query',
        };
      }

      // Run agent with the query from Conductor
      const result = await prescriptionTransitionManagerAgent.invoke({
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });

      const response = result.messages[result.messages.length - 1].content;

      const toolsUsed = result.messages
        .filter((msg) => msg.tool_calls && msg.tool_calls.length > 0)
        .flatMap((msg) => msg.tool_calls.map((tc) => tc.name));

      return {
        outputData: {
          response: response,
          toolsUsed: toolsUsed,
          messageCount: result.messages.length,
        },
        status: 'COMPLETED',
      };
    } catch (error) {
      return {
        outputData: { error: error.message, response: null },
        status: 'FAILED',
        reasonForIncompletion: `Agent execution failed: ${error.message}`,
      };
    }
  },
};

const communicationDrafterAgentWorker = {
  taskDefName: 'communication_drafter',
  execute: async (task) => {
    try {
      // Get query from Conductor input
      const query = task.inputData?.query;

      if (!query) {
        return {
          outputData: {
            error: 'No query provided',
            response: null,
          },
          status: 'FAILED_WITH_TERMINAL_ERROR',
          reasonForIncompletion: 'Missing required input: query',
        };
      }

      const enhancedQuery = `${query} 
            Additional patient information: - Patient name: Annie - Current medication: Propranolol (needs refill ASAP) - Situation: International relocation, urgent medication refill needed`;

      // Run agent with the query from Conductor
      const result = await drafterAgent.invoke({
        messages: [
          {
            role: 'user',
            content: enhancedQuery,
          },
        ],
      });

      const response = result.messages[result.messages.length - 1].content;

      const toolsUsed = result.messages
        .filter((msg) => msg.tool_calls && msg.tool_calls.length > 0)
        .flatMap((msg) => msg.tool_calls.map((tc) => tc.name));

      return {
        outputData: {
          response: response,
          toolsUsed: toolsUsed,
          messageCount: result.messages.length,
        },
        status: 'COMPLETED',
      };
    } catch (error) {
      return {
        outputData: { error: error.message, response: null },
        status: 'FAILED',
        reasonForIncompletion: `Agent execution failed: ${error.message}`,
      };
    }
  },
};

const medicalSystemNavigatorAgentWorker = {
  taskDefName: 'medical_system_navigator',
  execute: async (task) => {
    try {
      // Get query from Conductor input
      const query = task.inputData?.query;

      if (!query) {
        return {
          outputData: {
            error: 'No query provided',
            response: null,
          },
          status: 'FAILED_WITH_TERMINAL_ERROR',
          reasonForIncompletion: 'Missing required input: query',
        };
      }

      // Run agent with the query from Conductor
      const result = await medicialSystemNavigatorAgent.invoke({
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });

      const response = result.messages[result.messages.length - 1].content;

      const toolsUsed = result.messages
        .filter((msg) => msg.tool_calls && msg.tool_calls.length > 0)
        .flatMap((msg) => msg.tool_calls.map((tc) => tc.name));

      return {
        outputData: {
          response: response,
          toolsUsed: toolsUsed,
          messageCount: result.messages.length,
        },
        status: 'COMPLETED',
      };
    } catch (error) {
      return {
        outputData: { error: error.message, response: null },
        status: 'FAILED',
        reasonForIncompletion: `Agent execution failed: ${error.message}`,
      };
    }
  },
};

async function startWorker() {
  const client = await orkesConductorClient({
    serverUrl: process.env.CONDUCTOR_SERVER_URL,
    keyId: process.env.CONDUCTOR_AUTH_KEY,
    keySecret: process.env.CONDUCTOR_AUTH_SECRET,
  });

  console.log('Connected to Conductor ✅');

  const taskManager = new TaskManager(
    client,
    [
      healthcareProviderFinderWorker,
      communicationDrafterAgentWorker,
      medicalSystemNavigatorAgentWorker,
      prescriptionTransitionManagerAgentWorker,
    ],
    { options: { concurrency: 10, pollInterval: 300 } }
  );

  taskManager.startPolling();

  process.on('SIGINT', () => {
    taskManager.stopPolling();
    process.exit(0);
  });
}

startWorker();
