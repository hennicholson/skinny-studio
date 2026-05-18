// Code validation for generated Remotion components

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateGeneratedCode(code: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check for required exports
  if (!code.includes('export default')) {
    errors.push('Missing default export - component must be exported as default');
  }

  // 2. Check for required imports
  if (!code.includes("from 'remotion'") && !code.includes('from "remotion"')) {
    errors.push("Missing import from 'remotion'");
  }

  // 3. Check for AbsoluteFill usage
  if (!code.includes('AbsoluteFill')) {
    warnings.push('Consider using AbsoluteFill as the root container');
  }

  // 4. Check for dangerous patterns
  const dangerousPatterns = [
    { pattern: /\beval\s*\(/, message: 'eval() is not allowed' },
    { pattern: /\bFunction\s*\(/, message: 'Function constructor is not allowed' },
    { pattern: /\bfetch\s*\(/, message: 'fetch() is not allowed in generated code' },
    { pattern: /\bXMLHttpRequest/, message: 'XMLHttpRequest is not allowed' },
    { pattern: /\brequire\s*\(/, message: 'require() is not allowed - use ES imports' },
    { pattern: /process\.env/, message: 'process.env access is not allowed' },
    { pattern: /\bfs\b/, message: 'File system access is not allowed' },
    { pattern: /\bchild_process/, message: 'child_process is not allowed' },
    { pattern: /\bexec\s*\(/, message: 'exec() is not allowed' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(`Security violation: ${message}`);
    }
  }

  // 5. Check for external imports (only allow relative and remotion)
  const importMatches = Array.from(code.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g));
  for (const match of importMatches) {
    const importPath = match[1];
    const allowedPatterns = [
      /^remotion$/,
      /^\.\.?\//,  // Relative imports
      /^react$/,
      /^react-dom$/,
    ];

    if (!allowedPatterns.some((p) => p.test(importPath))) {
      errors.push(`External import not allowed: ${importPath}`);
    }
  }

  // 6. Check for React component structure
  if (!code.includes('React.FC') && !code.includes(': FC') && !code.includes('function') && !code.includes('=>')) {
    warnings.push('Code may not define a valid React component');
  }

  // 7. Check for animation hooks
  if (!code.includes('useCurrentFrame') && !code.includes('useVideoConfig')) {
    warnings.push('Component may not be animated - missing Remotion hooks');
  }

  // 8. Basic syntax checks
  const syntaxChecks = [
    { check: () => countOccurrences(code, '{') !== countOccurrences(code, '}'), message: 'Mismatched curly braces' },
    { check: () => countOccurrences(code, '(') !== countOccurrences(code, ')'), message: 'Mismatched parentheses' },
    { check: () => countOccurrences(code, '[') !== countOccurrences(code, ']'), message: 'Mismatched square brackets' },
  ];

  for (const { check, message } of syntaxChecks) {
    if (check()) {
      errors.push(`Syntax error: ${message}`);
    }
  }

  // 9. Check for common Remotion mistakes
  if (code.includes('useState') || code.includes('useEffect')) {
    warnings.push('React useState/useEffect may cause issues - prefer Remotion hooks');
  }

  if (code.includes('setTimeout') || code.includes('setInterval')) {
    errors.push('setTimeout/setInterval not allowed - use frame-based timing');
  }

  // 10. Check interpolation ranges
  const interpolateMatches = Array.from(code.matchAll(/interpolate\s*\([^,]+,\s*\[([^\]]+)\]/g));
  for (const match of interpolateMatches) {
    const rangeStr = match[1];
    const numbers = rangeStr.split(',').map((s) => parseFloat(s.trim()));
    if (numbers.length >= 2) {
      // Check if inputRange is monotonically increasing
      for (let i = 1; i < numbers.length; i++) {
        if (!isNaN(numbers[i]) && !isNaN(numbers[i - 1]) && numbers[i] <= numbers[i - 1]) {
          errors.push(`interpolate inputRange must be strictly increasing: [${rangeStr}]`);
          break;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function countOccurrences(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) count++;
  }
  return count;
}

export default validateGeneratedCode;
