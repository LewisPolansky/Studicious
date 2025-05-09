import { useState, useEffect, type ChangeEvent, useRef } from 'react';
import jsPDF from 'jspdf';
import DOMPurify from 'dompurify';
import './App.css';
import StudiciousLogo from '../public/Studicious.png';

interface ConceptData {
  id?: number; // ID might be missing from JSON
  name: string;
  definition: string;
  checked?: boolean | null; // null or missing = checked
}

// Internal state representation always has an ID
interface ConceptState {
  id: number; // Use index as fallback
  name: string;
  definition: string;
  checked: boolean;
}

function App() {
  const [concepts, setConcepts] = useState<ConceptState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches);

  // New state for PDF customization
  const [headerFontSize, setHeaderFontSize] = useState<number>(7);
  const [bodyFontSize, setBodyFontSize] = useState<number>(7);
  const [lineHeight, setLineHeight] = useState<number>(1); // Multiplier
  const [conceptsPerPage, setConceptsPerPage] = useState<number>(100); // Max concepts before page break
  const [columnCount, setColumnCount] = useState<number>(1); // Number of columns in PDF
  const [conceptSpacing, setConceptSpacing] = useState<number>(1); // Space between concepts in mm
  const [headerDefSpacing, setHeaderDefSpacing] = useState<number>(0.5); // Space between header and definition in mm
  const [usePlainTextFormulas, setUsePlainTextFormulas] = useState<boolean>(true); // Default to text mode for better compatibility

  // New state for PDF preview
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // New state for tutorial and concept input widget
  const [showUploadHighlight, setShowUploadHighlight] = useState(false);
  const [conceptInput, setConceptInput] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // New state for JSON paste widget
  const [jsonInput, setJsonInput] = useState('');
  
  // Reference to the HTML container for rendering formulas
  const formulaContainerRef = useRef<HTMLDivElement>(null);

  // Helper to process raw concept data and ensure unique IDs
  const processConcepts = (data: ConceptData[]): ConceptState[] => {
    return data.map((concept, index) => ({
      ...concept,
      id: concept.id ?? index, // Use provided ID or fallback to index
      checked: concept.checked === false ? false : true // null, undefined, or true = checked
    }));
  };

  // Basic validation for uploaded/fetched data
  const isValidConceptData = (data: any): data is ConceptData[] => {
    return Array.isArray(data) && data.every(item =>
      item && typeof item.name === 'string' && typeof item.definition === 'string'
      // ID and checked are optional in the source file
    );
  }

  // Save concepts to localStorage whenever they change
  useEffect(() => {
    if (concepts.length > 0) {
      // Convert ConceptState[] to ConceptData[] for storage
      const dataToSave = concepts.map(concept => ({
        id: concept.id,
        name: concept.name,
        definition: concept.definition,
        checked: concept.checked
      }));
      localStorage.setItem('studyConceptsData', JSON.stringify(dataToSave));
    }
  }, [concepts]);

  useEffect(() => {
    const fetchConcepts = async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors

        // Try to load from localStorage first
        const savedData = localStorage.getItem('studyConceptsData');
        if (savedData) {
          try {
            const parsedData = JSON.parse(savedData);
            if (isValidConceptData(parsedData)) {
              setConcepts(processConcepts(parsedData));
              setLoading(false);
              return; // Exit early if we successfully loaded from localStorage
            }
          } catch (e) {
            console.warn("Failed to parse localStorage data, falling back to concepts.json");
          }
        }

        // Fallback to loading from file
        const response = await fetch('/concepts.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!isValidConceptData(data)) {
          throw new Error("Fetched data is not in the expected format (array of objects with name and definition).");
        }
        setConcepts(processConcepts(data));
      } catch (e) {
        console.error("Failed to fetch concepts:", e);
        if (e instanceof Error) {
          setError(`Failed to load concepts: ${e.message}`);
        } else {
          setError("Failed to load concepts due to an unknown error.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConcepts();
  }, []);

  // Cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]); // Re-run if pdfPreviewUrl changes (though only cleanup matters)

  const handleCheckboxChange = (id: number) => {
    setConcepts(prevConcepts =>
      prevConcepts.map(concept =>
        concept.id === id ? { ...concept, checked: !concept.checked } : concept
      )
    );
    // The useEffect hook will save to localStorage whenever concepts change
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError(null); // Clear previous errors
    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
          if (typeof content === 'string') {
            const data = JSON.parse(content);
            // Use updated validation and processing
            if (isValidConceptData(data)) {
              setConcepts(processConcepts(data));
            } else {
              setError("Invalid JSON format. Expected an array of objects with name and definition.");
            }
          } else {
            setError("File content could not be read as text.");
          }
        } catch (err) {
          console.error("Failed to parse uploaded JSON:", err);
          if (err instanceof Error) {
            setError(`Failed to parse JSON: ${err.message}`);
          } else {
            setError("Failed to parse JSON due to an unknown error.");
          }
        }
      };
      reader.onerror = () => {
        console.error("Failed to read file:", reader.error);
        setError("Failed to read the uploaded file.");
      }
      reader.readAsText(file);
    } else if (file) { // Handle case where file is selected but not JSON
      setError("Please upload a valid JSON file (.json).");
    }
    // Reset the input value to allow uploading the same file again
    event.target.value = '';
  };

  const exportJson = () => {
    // Only include necessary data for export
    const dataToExport = concepts.map(concept => ({
      id: concept.id,
      name: concept.name,
      definition: concept.definition,
      checked: concept.checked
    }));

    // Create a blob and download link
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'study-concepts.json';
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    // Regenerate the PDF with the current settings and trigger save
    const doc = createPdfDocument(); // Use a helper function
    if (doc) {
      doc.save("study-guide.pdf");
    }
  };

  const generateStudyGuide = () => {
    // Revoke previous blob URL if it exists, to free memory
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }

    const doc = createPdfDocument(); // Use helper
    if (doc) {
      // Generate Blob URL for preview
      const blobUrl = doc.output('bloburl');
      setPdfPreviewUrl(blobUrl);
      // Don't save here, let the download button handle it
      // doc.save("study-guide.pdf"); 
    }
  };

  // Remove auto-population: Start with blank concepts
  useEffect(() => {
    setConcepts([]);
    setLoading(false);
  }, []);

  // Helper for ChatGPT prompt
  const getChatGptPrompt = (concepts: string) => {
    // Check if formulas should be included in the prompt
    const includeFormulas = localStorage.getItem('includeFormulas') === 'true';
    
    // Base prompt template
    let promptTemplate = `Please turn the following list of study concepts into a JSON array where each item has a 'name' and a 'definition'.\n\nConcepts:\n${concepts}\n\nFormat example:\n[\n  {\n    "name": "Concept Name",\n    "definition": "A clear, concise definition`;
    
    // Add formula instructions if selected
    if (includeFormulas) {
      promptTemplate += `, including any formulas. For formulas, use plain text notation rather than LaTeX or markup. Example: 'sigma_p = sqrt(w_1^2 * sigma_1^2 + w_2^2 * sigma_2^2 + 2*w_1*w_2*rho_12*sigma_1*sigma_2)' for portfolio risk."`;
    } else {
      promptTemplate += `."`;
    }
    
    promptTemplate += `\n  }\n]\n\nOnly return the JSON array, nothing else.`;
    
    return promptTemplate;
  }

  const handleCopyPrompt = () => {
    const prompt = getChatGptPrompt(conceptInput);
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedPrompt(true);
      setShowUploadHighlight(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    });
  };

  const handleJsonPaste = () => {
    try {
      // Create a sanitized version of the input by replacing common issues
      let sanitizedInput = jsonInput;
      
      // Attempt to parse the JSON
      const data = JSON.parse(sanitizedInput);
      if (isValidConceptData(data)) {
        setConcepts(processConcepts(data));
        setJsonInput(''); // Clear the input after successful processing
        setError(null); // Clear any previous errors
      } else {
        setError("Invalid JSON format. Expected an array of objects with name and definition.");
      }
    } catch (err) {
      console.error("Failed to parse pasted JSON:", err);
      
      // Try to detect if the error might be related to special characters in formulas
      if (err instanceof Error && err.message.includes("Unexpected token")) {
        try {
          // Try to apply more aggressive JSON sanitizing
          // This approach attempts to fix common issues with special characters in formulas
          const lines = jsonInput.split('\n');
          const sanitizedLines = lines.map(line => {
            // Only sanitize lines that look like they contain definition text
            if (line.includes('"definition":')) {
              // Replace problematic sequences that might be part of formulas
              return line.replace(/\\(?!["\\/bfnrt])/g, '\\\\');
            }
            return line;
          });
          
          const sanitizedInput = sanitizedLines.join('\n');
          
          // Try parsing the sanitized JSON
          const data = JSON.parse(sanitizedInput);
          if (isValidConceptData(data)) {
            setConcepts(processConcepts(data));
            setJsonInput(''); // Clear the input after successful processing
            setError(null); // Clear any previous errors
            return; // Exit early if we succeeded
          }
        } catch (sanitizeErr) {
          // Sanitization attempt failed, continue to error handling
        }
      }
      
      if (err instanceof Error) {
        setError(`Failed to parse JSON: ${err.message}. Formulas with special characters like √, ², σ should be valid, but make sure your JSON is properly formatted.`);
      } else {
        setError("Failed to parse JSON due to an unknown error.");
      }
    }
  };

  // Helper function for replacing special math characters with their most compatible representation
  const replaceSpecialChars = (text: string): string => {
    if (!text || !usePlainTextFormulas) return text || '';
    
    return text
      // Greek letters - replace with spelled out versions
      .replace(/σ/g, 'sigma')
      .replace(/Σ/g, 'Sigma')
      .replace(/μ/g, 'mu')
      .replace(/π/g, 'pi')
      .replace(/ρ/g, 'rho')
      .replace(/θ/g, 'theta')
      .replace(/Θ/g, 'Theta')
      .replace(/α/g, 'alpha')
      .replace(/β/g, 'beta')
      .replace(/γ/g, 'gamma')
      .replace(/Γ/g, 'Gamma')
      .replace(/δ/g, 'delta')
      .replace(/Δ/g, 'Delta')
      .replace(/ε/g, 'epsilon')
      .replace(/λ/g, 'lambda')
      .replace(/Λ/g, 'Lambda')
      .replace(/φ/g, 'phi')
      .replace(/Φ/g, 'Phi')
      .replace(/ω/g, 'omega')
      .replace(/Ω/g, 'Omega')
      
      // Math operators and symbols
      .replace(/√/g, 'sqrt')
      .replace(/∛/g, 'cbrt')
      .replace(/∜/g, '4thrt')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/⁴/g, '^4')
      .replace(/⁵/g, '^5')
      .replace(/⁰/g, '^0')
      .replace(/⁻/g, '^-')
      .replace(/⁺/g, '^+')
      .replace(/±/g, '+/-')
      .replace(/∓/g, '-/+')
      .replace(/×/g, 'x')
      .replace(/÷/g, '/')
      .replace(/∞/g, 'inf')
      .replace(/≈/g, '~=')
      .replace(/≠/g, '!=')
      .replace(/≤/g, '<=')
      .replace(/≥/g, '>=')
      .replace(/∑/g, 'sum')
      .replace(/∏/g, 'prod')
      .replace(/∫/g, 'int')
      .replace(/∂/g, 'partial')
      .replace(/∇/g, 'nabla')
      .replace(/∈/g, 'in')
      .replace(/∉/g, 'not in')
      .replace(/⊂/g, 'subset')
      .replace(/⊃/g, 'supset')
      .replace(/∩/g, 'intersect')
      .replace(/∪/g, 'union')
      
      // Subscripts - convert to _n notation
      .replace(/₁/g, '_1')
      .replace(/₂/g, '_2')
      .replace(/₃/g, '_3')
      .replace(/₄/g, '_4')
      .replace(/₅/g, '_5')
      .replace(/₆/g, '_6')
      .replace(/₇/g, '_7')
      .replace(/₈/g, '_8')
      .replace(/₉/g, '_9')
      .replace(/₀/g, '_0')
      
      // Common physics/chemistry notations
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/↔/g, '<->')
      .replace(/⇌/g, '<=>');
  };

  // Helper function to create the PDF document based on current state
  const createPdfDocument = (): jsPDF | null => {
    const checkedConcepts = concepts.filter(concept => concept.checked);
    if (checkedConcepts.length === 0) {
      alert("Please select at least one concept to include in the study guide.");
      return null;
    }

    // Create PDF with specialized settings for better formula support
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: false, // Disable compression for better text support
      putOnlyUsedFonts: true
    });

    // Try to improve font settings for better formula support
    doc.setFont('Helvetica');

    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const effectivePageHeight = pageHeight - 20; // Subtract top/bottom margins (10 each)

    // Track Y position for each column separately
    const columnYPositions: number[] = Array(columnCount).fill(10 + headerFontSize * 0.5);
    let currentColumn = 0;
    let conceptsOnPage = 0;

    // Adjust for columns
    const colWidth = (pageWidth - 20) / columnCount; // 10mm margin on each side

    // Add title only once per page
    doc.setFontSize(headerFontSize);
    doc.text("Study Guide", 10, 10);

    checkedConcepts.forEach((concept) => {
      // Get current Y position for this column
      let yPos = columnYPositions[currentColumn];

      // Calculate x position based on current column
      const xPos = 10 + (currentColumn * colWidth);

      // Process text to replace special characters with compatible alternatives
      const nameText = replaceSpecialChars(concept.name);
      const defText = replaceSpecialChars(concept.definition);
      
      // Rough estimation of lines needed
      const nameEstLines = Math.ceil(nameText.length / 40) + (nameText.split('\n').length - 1);
      const defEstLines = Math.ceil(defText.length / 40) + (defText.split('\n').length - 1);
      
      const estimatedHeight = (nameEstLines * (bodyFontSize + 2) * lineHeight * 0.35) + 
        (defEstLines * bodyFontSize * lineHeight * 0.35) + conceptSpacing;

      const pageBreakNeededByCount = conceptsPerPage > 0 && conceptsOnPage >= conceptsPerPage;
      const pageBreakNeededByHeight = (yPos + estimatedHeight) > effectivePageHeight;

      // If this concept won't fit in current column
      if (pageBreakNeededByCount || pageBreakNeededByHeight) {
        // Try next column if available
        if (currentColumn < columnCount - 1) {
          currentColumn++;
          // Use the Y position of the next column
          yPos = columnYPositions[currentColumn];
        } else {
          // If we've used all columns, add a new page
          doc.addPage();
          // Reset all column positions
          columnYPositions.fill(10 + headerFontSize * 0.5);
          currentColumn = 0;
          yPos = columnYPositions[0];
          conceptsOnPage = 0;

          // Add title for new page
          doc.setFontSize(headerFontSize);
          doc.text("Study Guide", 10, 10);
        }
      }

      // Add concept name
      doc.setFontSize(bodyFontSize + 2); // Slightly larger for name
      doc.setFont('Helvetica', 'bold');
      
      // Split text to handle line wrapping
      const nameLines = doc.splitTextToSize(nameText, colWidth - 5);
      doc.text(nameLines, xPos, yPos);
      yPos += nameLines.length * (bodyFontSize + 2) * lineHeight * 0.35 + headerDefSpacing;

      // Add definition
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(bodyFontSize);
      
      // Use text wrapping for definitions
      const defLines = doc.splitTextToSize(defText, colWidth - 5);
      doc.text(defLines, xPos, yPos);
      yPos += defLines.length * bodyFontSize * lineHeight * 0.35 + conceptSpacing;

      // Update the Y position for this column
      columnYPositions[currentColumn] = yPos;

      conceptsOnPage++;
    });

    return doc;
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <p className="text-lg">Loading concepts...</p>
    </div>
  );

  if (error) return (
    <div className="error-message">
      <p className="font-semibold">Error</p>
      <p className="text-sm">{error}</p>
    </div>
  );

  return (
    <div className={`min-h-screen py-8 ${darkMode ? 'dark-mode' : ''} studicious-bg`}>
      {/* Dark Mode Toggle - Sticky */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="theme-toggle"
        aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? '🌞' : '🌚'}
      </button>

      {/* Hidden container for formula rendering - not visible but used for HTML content */}
      <div 
        ref={formulaContainerRef} 
        style={{ display: 'none' }} 
        className="formula-container"
      ></div>

      {/* Wordmark with background and logo */}
      <div className="studicious-wordmark">
        <img src={StudiciousLogo} alt="Studicious wordmark" className="studicious-logo" />
        <h2 className="studicious-header">AI Cheat Sheet Generator</h2>
      </div>

      {/* Tutorial Section */}
      <div className="card studicious-tutorial">
        <h3 className="studicious-tutorial-title">Setting up Studicious</h3>
        <b>1. Paste your list of concepts</b> below and click <b>"Copy ChatGPT Prompt"</b>
        <br />
        <br />

        <textarea
          id="conceptInput"
          value={conceptInput}
          onChange={e => setConceptInput(e.target.value)}
          rows={5}
          className="studicious-concept-textarea"
          placeholder="E.g. Photosynthesis, Newton's First Law, Mitochondria..."
        />
        <div className="flex">
          <button
            className="btn btn-primary studicious-copy-btn"
            onClick={handleCopyPrompt}
            disabled={!conceptInput.trim()}
          >
            {copiedPrompt ? 'Copied!' : 'Copy ChatGPT Prompt'}
          </button>
          {/* Toggle to add Request to add formulas */}
          <div className="flex items-center gap-2 mt-2 justify-center">
            <input
              type="checkbox"
              id="includeFormulas"
              className="studicious-checkbox"
              defaultChecked={false}
              onChange={(e) => {
                // Update the concept input template based on checkbox
                const includeFormulas = e.target.checked;
                // This will be used when generating the ChatGPT prompt
                localStorage.setItem('includeFormulas', String(includeFormulas));
              }}
            />
            <label htmlFor="includeFormulas" className="text-xs">
              Include request for formulas
            </label>
          </div>
        </div>
      </div>

      <div className="card studicious-tutorial">
        <p>
          <b>2. Paste this prompt</b> into <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer">ChatGPT</a>, copy the JSON it gives you.
        </p>
      </div>

      {/* JSON Paste Widget */}
      <div className="card studicious-concept-widget">
        <p><b>3. Paste the ChatGPT JSON</b> output below:</p>
        <br />
        <textarea
          id="jsonInput"
          value={jsonInput}
          onChange={e => setJsonInput(e.target.value)}
          rows={5}
          className="studicious-concept-textarea"
          placeholder='[{"name": "Concept Name", "definition": "A clear, concise definition with formulas like σp = sqrt(w₁²σ₁² + w₂²σ₂²)."}]'
          title="JSON should have proper formatting. Special characters in formulas (σ, √, ²) are supported."
        />
        <button
          className="btn btn-primary studicious-copy-btn"
          onClick={handleJsonPaste}
          disabled={!jsonInput.trim()}
        >
          Process JSON
        </button>
        {/* <span className="studicious-concept-hint">
          After processing, you can customize your PDF! <b>Formula tips</b>: Use Unicode symbols (σ, √, ²) for math notation. Use the "Formula Display Mode" option below for better PDF compatibility.
        </span> */}
      </div>

      {/* Main Controls Section (with upload highlight) */}
      <div className={`flex flex-col gap-4 mb-4 p-4 card ${darkMode ? 'dark' : ''} studicious-upload-controls${showUploadHighlight ? ' studicious' : ''}`}>
        <div className="flex sm-flex-row gap-3 justify-center">
          <input
            type="file"
            id="fileUpload"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label
            htmlFor="fileUpload"
            className="btn btn-secondary"
            onAnimationEnd={() => setShowUploadHighlight(false)}
          >
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{ marginRight: '8px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload New JSON
          </label>
          <button
            onClick={exportJson}
            className="btn btn-secondary"
          >
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{ marginRight: '8px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Export JSON
          </button>
        </div>
      </div>

      {/* --- PDF Customization Controls --- */}
      <div className={`grid grid-cols-1 md-grid-cols-2 lg-grid-cols-4 gap-4 mb-4 p-4 card ${darkMode ? 'dark' : ''}`}>
        {/* Header Font Size */}
        <div>
          <label htmlFor="headerFontSize">Header Font (pt)</label>
          <input
            type="number"
            id="headerFontSize"
            value={headerFontSize}
            onChange={(e) => setHeaderFontSize(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        {/* Body Font Size */}
        <div>
          <label htmlFor="bodyFontSize">Body Font (pt)</label>
          <input
            type="number"
            id="bodyFontSize"
            value={bodyFontSize}
            onChange={(e) => setBodyFontSize(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        {/* Line Height */}
        <div>
          <label htmlFor="lineHeight">Line Height</label>
          <input
            type="number"
            id="lineHeight"
            step="0.1"
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        {/* Concepts Per Page */}
        <div>
          <label htmlFor="conceptsPerPage">Max Items/Page</label>
          <input
            type="number"
            id="conceptsPerPage"
            min="1"
            step="1"
            value={conceptsPerPage}
            onChange={(e) => setConceptsPerPage(Math.max(1, parseInt(e.target.value, 10)) || 1)} // Ensure positive integer
            className="mt-1"
          />
        </div>
        {/* Column Count */}
        <div>
          <label htmlFor="columnCount">Columns (experimental & buggy)</label>
          <input
            type="number"
            id="columnCount"
            min="1"
            max="3"
            step="1"
            value={columnCount}
            onChange={(e) => setColumnCount(Math.max(1, parseInt(e.target.value, 10)) || 1)} // Ensure positive integer
            className="mt-1"
          />
        </div>
        {/* Concept Spacing */}
        <div>
          <label htmlFor="conceptSpacing">Spacing (mm)</label>
          <input
            type="number"
            id="conceptSpacing"
            min="1"
            step="1"
            value={conceptSpacing}
            onChange={(e) => setConceptSpacing(Math.max(1, Number(e.target.value)) || 5)}
            className="mt-1"
          />
        </div>
        {/* Header-Definition Spacing */}
        <div>
          <label htmlFor="headerDefSpacing">Spacing below Header</label>
          <input
            type="range"
            id="headerDefSpacing"
            min="0"
            max="2"
            step="0.5"
            value={headerDefSpacing}
            onChange={(e) => setHeaderDefSpacing(Number(e.target.value))}
            className="mt-1 w-full"
          />
          <div className="text-xs text-center">{headerDefSpacing}mm</div>
        </div>
        
        {/* Formula rendering toggle */}
        <div>
          <label htmlFor="usePlainTextFormulas">Formula Display</label>
          <div className="flex items-center mt-1">
            <input
              type="checkbox"
              id="usePlainTextFormulas"
              checked={usePlainTextFormulas}
              onChange={(e) => setUsePlainTextFormulas(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="usePlainTextFormulas" className="text-xs">
              {usePlainTextFormulas ? "Text mode" : "Symbol mode"}
            </label>
          </div>
        </div>
      </div>

      <div className={`flex flex-col gap-4 mb-4 card ${darkMode ? 'dark' : ''} studicious-upload-controls${showUploadHighlight ? ' studicious' : ''}`}>
        <button
          onClick={generateStudyGuide}
          className="btn btn-generate btn-large p-6 text-2xl"
        >
          <svg className="w-36 h-36" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ marginRight: '10px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate PDF
        </button>
      </div>

      {/* --- PDF Preview Section --- */}
      {pdfPreviewUrl && (
        <div className={`preview-container ${darkMode ? 'dark' : ''}`}>
          <h2 className="text-xl font-semibold mb-3">Preview</h2>
          <div className="aspect-ratio-container">
            <iframe
              src={pdfPreviewUrl}
              title="PDF Preview"
            />
          </div>
          <button
            onClick={downloadPdf}
            className="btn btn-generate btn-large mt-4"
          >
            Download PDF
          </button>
        </div>
      )}

      {/* Error Message Display */}
      {error && (
        <div className={`error-message ${darkMode ? 'dark' : ''}`}>
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="card studicious-tip">
        <p>Uncheck concepts you already know so they won't appear in your PDF!</p>
      </div>

      {/* Concepts List */}
      <ul className="concept-list md-grid-cols-2">
        {concepts.map(concept => (
          <li
            key={concept.id}
            onClick={() => handleCheckboxChange(concept.id)}
            className={`concept-card ${!concept.checked ? 'unchecked' : ''} ${darkMode ? 'dark' : ''}`}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleCheckboxChange(concept.id); } }}
          >
            <div className="flex items-center">
              <input
                id={`concept-${concept.id}`}
                type="checkbox"
                checked={concept.checked}
                onChange={(e) => { e.stopPropagation(); handleCheckboxChange(concept.id); }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="concept-content">
              <div>
                <label htmlFor={`concept-${concept.id}`} id={`concept-name-${concept.id}`} className="concept-title">
                  {concept.name}
                </label>
                <p className="concept-description">
                  {concept.definition}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;