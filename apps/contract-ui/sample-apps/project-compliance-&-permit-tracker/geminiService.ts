import type { FunctionDeclaration } from "@google/genai";
import { GoogleGenAI, Type } from "@google/genai";
import type { Project } from "./types";

// Tool definition for the agent to update tasks
const updateTaskTool: FunctionDeclaration = {
  name: "updateProjectTask",
  parameters: {
    type: Type.OBJECT,
    description:
      "Update the status or a checkpoint of a specific project task.",
    properties: {
      projectId: {
        type: Type.STRING,
        description: "ID of the project (e.g. P-001)",
      },
      taskName: {
        type: Type.STRING,
        description: 'Name of the task (e.g. "Contract" or "Dust Permit")',
      },
      status: {
        type: Type.STRING,
        description: "New status string or boolean representation",
      },
      checkpointLabel: {
        type: Type.STRING,
        description: "Label of a specific sub-checkpoint to mark as complete",
      },
      isCompleted: {
        type: Type.BOOLEAN,
        description: "Completion status of the checkpoint",
      },
    },
    required: ["projectId", "taskName"],
  },
};

export const chatWithAgent = async (projects: Project[], history: any[]) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `System context: You are a construction compliance agent. You can help users manage their projects. Current Projects Data: ${JSON.stringify(projects)}`,
            },
          ],
        },
        ...history,
      ],
      config: {
        tools: [{ functionDeclarations: [updateTaskTool] }],
      },
    });

    return response;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
};
