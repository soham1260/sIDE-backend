require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
mongoose.connect(process.env.DB);
const { v4: uuidv4 } = require('uuid');
const app = express();
const cors = require("cors");
const execute_c = require("./execution_scripts/execute_c");
const execute_cpp = require("./execution_scripts/execute_cpp");
const execute_python = require("./execution_scripts/execute_python");
const execute_java = require("./execution_scripts/execute_java");
const execute_javascript = require("./execution_scripts/execute_javascript");

const Docker = require('dockerode');
let docker;
if (process.env.VM_IP && process.env.VM_PORT) {
  docker = new Docker({
    host: process.env.VM_IP,
    port: process.env.VM_PORT,
  });
  console.log(`Connected to remote Docker: ${process.env.VM_IP}:${process.env.VM_PORT}`);
} else {
  docker = new Docker();
  console.log('Using local Docker socket');
}

const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.AI });

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { body, validationResult } = require("express-validator");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  codes: [
    {
      filename: { type: String },
      code: { type: String },
      language: { type: String },
    },
  ],
  execution_history: [
    {
      filename: { type: String },
      code: { type: String },
      language: { type: String },
      output: {type: String},
      date: {type: Date}
    },
  ],
});
const User = mongoose.model("User", userSchema);

const tempCodeSchema = new mongoose.Schema({
  code: {
      type: String,
      required: true
  },
  expiresAt: {
      type: Date,
      required: true
  },
  // user: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'User',
  //   required: true
  // },
  language: { type: String },
  name: { type: String },
  uuid: {
    type: String,
    default: uuidv4,
    required: true
  }
});
const tempCode = mongoose.model("tempCode", tempCodeSchema);

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT;

app.post(
  "/login",
  [
    body("email", "Enter a valid email").isEmail(),
    body("password", "Password cannot be blank").exists(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    User.findOne({ email })
      .then((user) => {
        if (!user) {
          throw new Error("Invalid email or password");
        }
        return Promise.all([user.id, bcrypt.compare(password, user.password)]);
      })
      .then(([x, passwordCompare]) => {
        if (!passwordCompare) {
          throw new Error("Invalid email or password");
        }
        const data = {
          user: {
            id: x,
          },
        };
        const authtoken = jwt.sign(data, JWT_SECRET);
        console.log(
          new Date().toLocaleString([], { hour12: false }) +
            " : " +
            email +
            " logged in"
        );
        res.json({ success: true, authtoken });
      })
      .catch((error) => {
        if (error.message === "Invalid email or password") {
          console.log(
            new Date().toLocaleString([], { hour12: false }) +
              " : " +
              error.message +
              " " +
              email
          );
          res.status(400).json({
            success: false,
            error: "Please try to login with correct credentials",
          });
        } else {
          console.log(
            new Date().toLocaleString([], { hour12: false }) +
              " : " +
              error.message
          );
          res.status(500).send("Internal Server Error");
        }
      });
  }
);

app.post(
  "/signup",
  [
    body("name", "name").isLength({ min: 3 }),
    body("email", "email").isEmail(),
    body("password", "password").isLength({ min: 5 }),
  ],
  (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    User.findOne({ email: req.body.email })
      .then((user) => {
        if (user) throw new Error("UserExistsError");
      })
      .then(() => {
        return bcrypt.genSalt();
      })
      .then((salt) => {
        return bcrypt.hash(req.body.password, salt);
      })
      .then((secPass) => {
        return User.create({
          name: req.body.name,
          password: secPass,
          email: req.body.email,
        });
      })
      .then((user) => {
        const data = {
          user: {
            id: user.id,
          },
        };
        const authtoken = jwt.sign(data, JWT_SECRET);
        success = true;
        console.log(
          new Date().toLocaleString([], { hour12: false }) +
            " : New user" +
            user.email +
            " signed in"
        );
        res.json({ success, authtoken });
      })
      .catch((error) => {
        console.error(error.message);
        if (error.message === "UserExistsError") {
          res.status(400).json({ success: false, errors: [{ msg: "exist" }] });
        } else {
          console.log(
            new Date().toLocaleString([], { hour12: false }) +
              " : " +
              error.message
          );
          res.status(500).send("Internal Server Error");
        }
      });
  }
);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/hello", (req, res) => {
  res.send({ ans: "Hello World!" });
});

app.post("/submitcode", async (req, res) => {
  const { code, input, language, filename } = req.body;
  let response;

  try {
    switch (language) {
      case "c":
        response = await execute_c(docker, code, input);
        break;
      case "cpp":
        response = await execute_cpp(docker, code, input);
        break;
      case "python":
        response = await execute_python(docker, code, input);
        break;
      case "java":
        response = await execute_java(docker, code, input, filename);
        break;
      case "javascript":
        response = await execute_javascript(docker, code, input);
        break;
      default:
        res.status(500).json({ error: "Unexpected Input" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }

  const token = req.header('auth-token');
  if(token){
      try {
          const data = jwt.verify(token,JWT_SECRET);
          const userId = data.user.id;

          try {
              const user = await User.findById(userId);

              if (!user) {
                throw new Error("User not found");
              }
              user.execution_history.push({ filename, code, language, output : response.ans, date: Date.now() });
              await user.save();
          } catch (error) {
              console.error('Error saving code:', error);
              res.status(500).json({ error: 'Internal server error' });
          }
      } catch (error) {
          console.log(new Date().toLocaleString([], { hour12: false })+" : JWT verification failed");
          res.status(401).send({error : "Invalid token"});
      }
  }

  res.send(response);
});

app.listen(process.env.PORT, () => {
  console.log(`App listening at http://localhost:${process.env.PORT}`);
});

const fetchuser = (req,res,next ) => {
  const token = req.header('auth-token');
  if(!token){
      res.status(401).send({error : "Invalid token"});
  }

  try {
      const data = jwt.verify(token,JWT_SECRET);
      req.user = data.user;
      console.log(new Date().toLocaleString([], { hour12: false })+" : JWT verified user " + req.user.id);
      next();
  } catch (error) {
      console.log(new Date().toLocaleString([], { hour12: false })+" : JWT verification failed");
      res.status(401).send({error : "Invalid token"});
  }
}

app.post("/checkfileexists",fetchuser,async (req,res) => {
  const { language, filename } = req.body;
  try {
    const user = await User.findOne({
      _id: req.user.id,
      'codes.filename': filename,
      'codes.language': language
    });

    if (user) {
      return res.json({ exists: true });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/savefile', fetchuser, async (req, res) => {
  const { language, filename, code } = req.body;
  const userId = req.user.id;

  try {
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      const existingCodeEntry = user.codes.findIndex(
          (entry) => entry.filename === filename && entry.language === language
      );

      if (existingCodeEntry !== -1) {
        user.codes[existingCodeEntry].code = code;
    } else {
        user.codes.push({ filename, code, language });
    }

      await user.save();

      res.status(200).json({ message: 'Code saved successfully' });
  } catch (error) {
      console.error('Error saving code:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/fetchuserdata",fetchuser,async(req,res) => {
  try {
    const user = await User.findById(req.user.id, 'codes.filename codes.code codes.language codes._id');
    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/fetchcode",fetchuser,async(req,res) => {
  const { id } = req.query;
  try {
    const user = await User.findById(req.user.id);
    
    const code = user.codes.find(code => code._id.toString() === id);
    
    if (!code) {
      return res.status(200).json({ message: 'Code not found' });
    }

    res.json({
      language: code.language,
      code: code.code,
      filename: code.filename
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/deletecode",fetchuser,async(req,res) => {
  const { id } = req.query;

  try {
    const user = await User.findById(req.user.id);
    const codeIndex = user.codes.findIndex(code => code._id.toString() === id);

    if (codeIndex === -1) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    user.codes.splice(codeIndex, 1);

    await user.save();

    const response = await User.findById(req.user.id, 'codes.filename codes.code codes.language codes._id');

    res.status(200).json(response);
  } catch (error) {
    res.status(500).send('Server error');
  }
});

app.post("/sharecode",async(req,res) => {

  try {
    const { language, code, name } = req.body;
    const newTempCode = new tempCode({
      code: code,
      expiresAt: new Date(Date.now() + 300 * 1000),
      language: language,
      name: name
    });

    const savedCode = await newTempCode.save();
    
    res.status(200).json({urlid : savedCode.uuid})
  } catch (error) {
    res.status(500).send('Server error');
  }
});


app.get('/sharedcode/:uuid', async (req, res) => {
  try {
    
    const sharedCode = await tempCode.findOne({ uuid: req.params.uuid });//.populate('user')

    if (!sharedCode) {
      return res.status(404).send({message : 'Code not found or expired'});
    }

    res.json({
      language:sharedCode.language,
      code: sharedCode.code,
      name: sharedCode.name
      // user: sharedCode.user.name
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.post("/synccode",async(req,res) => {
  const { language, code, id } = req.body;
  try {
    const updatedCode = await tempCode.findOneAndUpdate(
      { uuid: id },
      {
        $set: {
          code: code,
          language: language
        }
      },
      { new: true }
    );

    if (!updatedCode) {
      return res.status(404).json({ message: "File not found" });
    }
  } catch (error) {
    console.log(error);
    
    res.status(500).send('Server error');
  }
});

app.post('/ai', [
        body('prompt').notEmpty().withMessage('Prompt cannot be empty')
    ],async(req,res) => {
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    let contents = "";
    if(req.body.code) {
      contents = "User has provided the following code \n"+req.body.code;
    }
    else {
      contents = "User did not provide any code.";
    }
    contents+="\n Users query: "+req.body.prompt;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: contents,
            config: {
              systemInstruction: `You are a code assistant. If code is provided, analyze it. The programming language is ${req.body.language || "unspecified"}. Answer the user's query. If the user asks something unrelated to the code or language, follow the user's intent anyway.`
            },
        });

        res.status(200).send({ response: response.candidates[0].content.parts[0].text });
    } catch (error) {
        console.log(new Date().toLocaleString([], { hour12: false }) + " : " + error);
        res.status(500).send({response:"Something's wrong on our side. Please try again."});
    }
})

app.get("/fetchuserexecutionhistory",fetchuser,async(req,res) => {
  try {
    const user = await User.findById(req.user.id, 'execution_history.filename execution_history.code execution_history.language execution_history._id');
    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});