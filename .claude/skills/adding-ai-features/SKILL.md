---
name: adding-ai-features
description: |
  Activate this skill when:
  - User wants smart/intelligent features
  - Auto-fill from photos, automatic categorization, summarization, translation
  - Document reading, image recognition, receipt scanning, invoice parsing
  - Extracting information from files or text
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Adding AI Features

All AI utility functions are **pre-generated** in `src/lib/ai.ts`. Do NOT rewrite them — just import.

## Available Functions

```typescript
import {
  chatCompletion,      // Core LLM call
  safeJsonCompletion,  // LLM call with JSON parsing + fallback
  withRetry,           // Retry wrapper
  classify,            // Categorize text into predefined categories
  extract,             // Extract structured data from text
  summarize,           // Condense text to key points
  translate,           // Translate between languages
  analyzeImage,        // Free-form image analysis
  analyzeDocument,     // Free-form PDF/document analysis
  extractFromPhoto,    // Structured data extraction from photo
  fileToDataUri,       // Encode File object for AI calls
  urlToDataUri,        // Encode URL content for AI calls
} from '@/lib/ai';
```

---

## Usage Patterns

### Auto-Categorize

```typescript
const { category, confidence } = await classify(
  record.fields.beschreibung,
  ["bug", "feature", "frage", "dokumentation"]
);
```

### Extract from Text

Define schema using the app's actual field names:

```typescript
const invoice = await extract<{
  rechnungsnummer: string;
  betrag: number;
  datum: string;
}>(
  text,
  '{"rechnungsnummer": "string", "betrag": "number", "datum": "YYYY-MM-DD"}'
);
```

### Auto-Fill from Photo

```typescript
const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setAnalyzing(true);
  try {
    const uri = await fileToDataUri(file);
    const data = await extractFromPhoto(uri, JSON.stringify({
      produkt: "string — product name",
      hersteller: "string — manufacturer",
      preis: "number — price",
      zustand: "string — one of: neu, gebraucht, defekt",
    }));
    setForm(prev => ({ ...prev, ...data }));
  } catch {
    setError("Foto konnte nicht analysiert werden");
  } finally {
    setAnalyzing(false);
  }
};
```

### Summarize Long Text

```typescript
const summary = await summarize(record.fields.beschreibung, {
  maxSentences: 2,
  language: "German",
});
```

### Translate

```typescript
const translated = await translate(record.fields.title, "German");
```

### Analyze Document (PDF)

```typescript
const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const uri = await fileToDataUri(file);
  const result = await analyzeDocument(uri, "Extract all invoice line items as JSON array");
};
```

### Custom LLM Call

For anything not covered by the helpers:

```typescript
const result = await chatCompletion([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: userInput },
]);
```

For structured output:

```typescript
const data = await safeJsonCompletion([
  { role: "system", content: "Respond ONLY with JSON: " + schema },
  { role: "user", content: text },
], { temperature: 0 });
```

---

## Schema Design Rules

1. **Use backend field names** — schema keys must match the app's actual field identifiers
2. **Include constraints** — `"one of: neu, gebraucht, defekt"` helps the LLM return valid values
3. **Match date formats** — `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:MM"` (no seconds!)
4. **Use null for unknowns** — always instruct "use null for fields that cannot be determined"

## Integration Rules

- **Always show loading state** during AI calls (they take 1-5 seconds)
- **Always handle errors** gracefully — AI is not reliable, treat results as suggestions
- **Let users review** auto-filled values before saving
- **Use `temperature: 0`** for extraction/classification (already set in helpers)
- **Parallelize** independent AI calls with `Promise.all`
- **Resize images** before encoding — 1024px wide is sufficient
- **MIME types matter** — `fileToDataUri` handles this automatically for File objects

## API Details

| Property | Value |
|----------|-------|
| Endpoint | `AI_ENDPOINT` from `@/lib/origin` — `{LA host}/litellm/v1/chat/completions`, resolved at runtime from the page origin; never spell a host |
| Model | `default` |
| Auth | None required |
| Format | OpenAI-compatible chat completions |
