import { describe, it, expect } from 'vitest';

describe('Test Setup', () => {
  it('should run basic tests', () => {
    expect(true).toBe(true);
  });

  it('should have access to jest-dom matchers', () => {
    const element = document.createElement('div');
    element.textContent = 'Hello World';
    document.body.appendChild(element);
    expect(element).toBeInTheDocument();
    document.body.removeChild(element);
  });

  it('should have window.matchMedia mocked', () => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    expect(mediaQuery).toBeDefined();
    expect(mediaQuery.matches).toBe(false);
  });
});

