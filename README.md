<p align="center" style="background-color: black">
  <img src="/studicious-app/public/Studicious.png" alt="Studicious Logo">
</p>

# Studicious 📝

### AI-Powered Study Guide Generator

[![Live Demo](https://img.shields.io/badge/Live_Demo-studicious.vercel.app-blue)](https://studicious.vercel.app)

## What is Studicious?

Studicious is an AI study tool for making cheat sheets.

1. Convert your list of study concepts into a structured JSON using a web-based LLM like ChatGPT (no need for API keys)
2. Generate clean, optimized PDF cheat sheets with customizable formatting
3. Toggle and easily check off the concepts you've mastered

## Running Locally

```
# Clone the repository
git clone https://github.com/LewisPolansky/studicious.git

# Navigate to the project directory
cd studicious-app

# Install dependencies
npm install

# Start the development server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## How to Contribute ❤️

Studicious is free and open source!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Stack

- Built with React and Vite
- PDF generation using jsPDF
- Deployed on Vercel (it's all just front-end)