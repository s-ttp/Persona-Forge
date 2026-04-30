import os
import io
import fitz # PyMuPDF
import docx

def parse_pdf(filepath: str) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    text = []
    try:
        doc = fitz.open(filepath)
        for page in doc:
            text.append(page.get_text())
        doc.close()
    except Exception as e:
        print(f"Error parsing PDF: {e}")
    return "\n".join(text)

def parse_docx(filepath: str) -> str:
    """Extract text from a Word document."""
    try:
        doc = docx.Document(filepath)
        return "\n".join([paragraph.text for paragraph in doc.paragraphs])
    except Exception as e:
        print(f"Error parsing DOCX: {e}")
        return ""

def process_file_to_text(filepath: str) -> str:
    """Determine the file type and extract text."""
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == ".pdf":
        return parse_pdf(filepath)
    elif ext in [".doc", ".docx"]:
        return parse_docx(filepath)
    elif ext in [".txt", ".csv", ".json"]:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported file extension: {ext}")
