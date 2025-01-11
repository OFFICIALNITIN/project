const express = require("express");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = 3000;

//Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname + "/public"));

let session = {
  questions: [],
};

app.get("/generate-question", async (req, res) => {
  const skill = req.query.skill || "General";
  console.log(skill);
  try {
    const prompt = `
      Generate a list of 5 ${skill} interview questions with its correct answers.
      Format the response as an array of objects with each object containing a "question" and "answer".
       `;
    const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
    const schema = {
      description: "An array of interview questions and their correct answers",
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: {
            type: SchemaType.STRING,
            description: "The question",
            nullable: false,
          },
          answer: {
            type: SchemaType.STRING,
            description: "The correct answer to the question",
            nullable: false,
          },
        },
        required: ["question", "answer"],
      },
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const result = await model.generateContent(prompt);
    const questionId = uuidv4();

    const aiOutput = JSON.parse(result.response.text());
    console.log(aiOutput);

    if (Array.isArray(aiOutput)) {
      aiOutput.forEach((item) => {
        const questionId = uuidv4(); // Generate a unique ID for each question
        session.questions.push({
          id: questionId,
          question: item.question,
          correctAnswer: item.answer,
          userAnswer: null,
          feedback: null,
        });
      });
    } else {
      console.error("Generated output is not an array", aiOutput);
      res.status(500).json({ error: "Failed to generate questions properly" });
      return;
    }

    res.json({
      questionId: session.questions[0].id,
      question: session.questions[0].question,
    });
  } catch (error) {
    console.error("Error generating question", error.message);
    res.status(500).json({ error: "Failed to generate question" });
  }
});

app.get("/get-question", (req, res) => {
  const questions = session.questions.map(({ id, question }) => ({
    id,
    question,
  }));
  res.json({ questions });
});

app.post("/verify-answer", async (req, res) => {
  const { questionId, userInput } = req.body;
  console.log(userInput);

  const questionObj = session.questions.find((q) => q.id === questionId);

  if (!questionObj) {
    return res.status(400).json({ error: "Invalid question ID" });
  }

  try {
    const genAI = new GoogleGenerativeAI(AI_API_KEY);

    const schema = {
      description: "Evaluation of user's answer",
      type: SchemaType.OBJECT,
      properties: {
        accuracy: { type: SchemaType.NUMBER, nullable: false },
        missingPoints: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          nullable: true,
        },
        suggestions: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          nullable: true,
        },
      },
      required: ["accuracy"],
    };

    const prompt = `
            Evaluate the following user's answer:
            Question: "${questionObj.question}"
            User's Answer: "${userInput}"

            Provide feedback in JSON format:
            {
                "accuracy": "Percentage of correctness (0-100)",
                "missingPoints": ["List missing key points in one word (max 3)"],
                "suggestions": ["Suggestions for improvement in one word (max 3)"]
            }
        `;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const result = await model.generateContent(prompt);
    const feedback = JSON.parse(result.response.text());

    questionObj.userAnswer = userInput;
    questionObj.feedback = feedback;

    res.json(feedback);
  } catch (error) {
    console.error("Error verifying answer:", error.message);
    res.status(500).json({ error: "Error generating feedback." });
  }
});

app.get("/get-feedback", (req, res) => {
  const feedbackSummary = session.questions.map((q) => ({
    question: q.question,
    userAnswer: q.userAnswer,
    feedback: q.feedback,
  }));

  res.json({ feedbackSummary });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
