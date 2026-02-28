import { describe, it, expect } from 'vitest';
import { parseRadarConfig, buildSystemPrompt } from '../src/services/config.js';

// ─── fixtures ───────────────────────────────────────────────────────────────

const FULL_TOML = `
[context]
role     = "Tech analyst"
industry = "Fintech"
language = "German"
tone     = "casual"

[tech_stack]
backend = "Java 21 / Spring Boot"
infra   = "AWS EKS"

[features]
auto_summary = true
digest       = false

[filter]
focus  = ["Kubernetes", "Java ecosystem"]
ignore = ["Crypto"]

[[relevance]]
name        = "Tech Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our stack"

[[relevance]]
name        = "Goals"
emoji       = "🎯"
sentences   = 1
description = "Our OKRs"

[output]
summary_sentences = 4

[adoption_path]
name        = "Adoption Path"
emoji       = "🚀"
sentences   = 4
description = "Can we try this now?"

[digest]
top_n = 3

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News"

[[digest.source]]
url   = "https://spring.io/blog.atom"
label = "Spring Blog"
`;

const MINIMAL_TOML = `
[context]
industry = "SaaS"
`;

// ─── parseRadarConfig ────────────────────────────────────────────────────────

describe('parseRadarConfig', () => {
  describe('full config', () => {
    it('parses context fields', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.context.role).toBe('Tech analyst');
      expect(cfg.context.industry).toBe('Fintech');
      expect(cfg.context.language).toBe('German');
      expect(cfg.context.tone).toBe('casual');
    });

    it('parses tech_stack with arbitrary keys', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.tech_stack.backend).toBe('Java 21 / Spring Boot');
      expect(cfg.tech_stack.infra).toBe('AWS EKS');
    });

    it('parses features', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.features.auto_summary).toBe(true);
      expect(cfg.features.digest).toBe(false);
    });

    it('parses filter lists', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.filter.focus).toEqual(['Kubernetes', 'Java ecosystem']);
      expect(cfg.filter.ignore).toEqual(['Crypto']);
    });

    it('parses multiple [[relevance]] entries', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.relevance).toHaveLength(2);
      expect(cfg.relevance[0]).toEqual({
        name: 'Tech Stack',
        emoji: '🔧',
        sentences: 2,
        description: 'How this relates to our stack',
      });
      expect(cfg.relevance[1]).toEqual({
        name: 'Goals',
        emoji: '🎯',
        sentences: 1,
        description: 'Our OKRs',
      });
    });

    it('parses output settings', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.output.summary_sentences).toBe(4);
    });

    it('parses [adoption_path] section', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.adoption_path.name).toBe('Adoption Path');
      expect(cfg.adoption_path.emoji).toBe('🚀');
      expect(cfg.adoption_path.sentences).toBe(4);
      expect(cfg.adoption_path.description).toBe('Can we try this now?');
    });

    it('parses digest settings and multiple sources', () => {
      const cfg = parseRadarConfig(FULL_TOML);
      expect(cfg.digest.top_n).toBe(3);
      expect(cfg.digest.source).toHaveLength(2);
      expect(cfg.digest.source[0]).toEqual({
        url: 'https://hnrss.org/best?count=30',
        label: 'Hacker News',
      });
      expect(cfg.digest.source[1]).toEqual({
        url: 'https://spring.io/blog.atom',
        label: 'Spring Blog',
      });
    });
  });

  describe('defaults for missing fields', () => {
    it('applies defaults when sections are absent', () => {
      const cfg = parseRadarConfig(MINIMAL_TOML);
      expect(cfg.features.auto_summary).toBe(true);
      expect(cfg.features.digest).toBe(true);
      expect(cfg.filter.focus).toEqual([]);
      expect(cfg.filter.ignore).toEqual([]);
      expect(cfg.relevance).toEqual([]);
      expect(cfg.output.summary_sentences).toBe(3);
      expect(cfg.adoption_path.name).toBe('Adoption Path');
      expect(cfg.adoption_path.emoji).toBe('🚀');
      expect(cfg.digest.top_n).toBe(5);
      expect(cfg.digest.source).toEqual([]);
    });

    it('applies false default correctly when key is missing', () => {
      // features.digest defaults to true
      const cfg = parseRadarConfig('[context]\nindustry = "test"');
      expect(cfg.features.digest).toBe(true);
    });
  });

  describe('code fence stripping', () => {
    it('strips ```toml fences before parsing', () => {
      const wrapped = '```toml\n[context]\nindustry = "Wrapped"\n```';
      const cfg = parseRadarConfig(wrapped);
      expect(cfg.context.industry).toBe('Wrapped');
    });

    it('strips plain ``` fences before parsing', () => {
      const wrapped = '```\n[context]\nindustry = "Plain"\n```';
      const cfg = parseRadarConfig(wrapped);
      expect(cfg.context.industry).toBe('Plain');
    });

    it('extracts TOML from mixed content with surrounding HTML', () => {
      const mixed = [
        "<div style='height: 200px; overflow: hidden'>",
        '<img src="https://example.com/banner.jpg" />',
        '</div>',
        '',
        '```toml',
        '[context]',
        'industry = "Gaming"',
        'language = "English"',
        '```',
      ].join('\n');
      const cfg = parseRadarConfig(mixed);
      expect(cfg.context.industry).toBe('Gaming');
      expect(cfg.context.language).toBe('English');
    });
  });

  describe('error handling', () => {
    it('throws on invalid TOML', () => {
      expect(() => parseRadarConfig('not valid = toml =')).toThrow();
    });

    it('throws on TOML with unclosed string', () => {
      expect(() => parseRadarConfig('[context]\nindustry = "unclosed')).toThrow();
    });
  });
});

// ─── buildSystemPrompt ───────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const fullConfig = parseRadarConfig(FULL_TOML);

  it('includes context key-value lines', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('- role: Tech analyst');
    expect(prompt).toContain('- industry: Fintech');
    expect(prompt).toContain('- language: German');
  });

  it('includes tech stack section', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('## Our Tech Stack');
    expect(prompt).toContain('- backend: Java 21 / Spring Boot');
    expect(prompt).toContain('- infra: AWS EKS');
  });

  it('includes focus and ignore lists', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('## What to Focus On');
    expect(prompt).toContain('- Kubernetes');
    expect(prompt).toContain('- Java ecosystem');
    expect(prompt).toContain('## Ignore');
    expect(prompt).toContain('- Crypto');
  });

  it('includes all relevance sections with star-rating instruction', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('🔧 **Tech Stack**');
    expect(prompt).toContain('2 sentence(s)');
    expect(prompt).toContain('🎯 **Goals**');
    expect(prompt).toContain('1 sentence(s)');
  });

  it('includes adoption path section from config', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('🚀 **Adoption Path**');
    expect(prompt).toContain('4 sentence(s)');
  });

  it('reflects summary_sentences count in output format', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('4 sentences, what happened');
  });

  it('uses context.tone in output', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('Tone: casual');
  });

  it('uses context.language in output', () => {
    const prompt = buildSystemPrompt(fullConfig);
    expect(prompt).toContain('Language: German');
  });

  it('falls back to "direct, technical" tone when not set', () => {
    const cfg = parseRadarConfig(MINIMAL_TOML);
    expect(buildSystemPrompt(cfg)).toContain('Tone: direct, technical');
  });

  it('falls back to "English" language when not set', () => {
    const cfg = parseRadarConfig(MINIMAL_TOML);
    expect(buildSystemPrompt(cfg)).toContain('Language: English');
  });

  it('handles empty tech_stack gracefully', () => {
    const cfg = parseRadarConfig(MINIMAL_TOML);
    const prompt = buildSystemPrompt(cfg);
    expect(prompt).toContain('## Our Tech Stack');
    // No crash, just empty section
  });

  it('handles empty relevance array gracefully', () => {
    const cfg = parseRadarConfig(MINIMAL_TOML);
    // Should not throw and should still include output format header
    const prompt = buildSystemPrompt(cfg);
    expect(prompt).toContain('## Output Format');
  });
});
