# Canvas Templates & Examples

These are example templates for the Slack Canvas tabs. Copy-paste into your canvases and customize for your team.

---

## Canvas: "Prompt"

This canvas is the system prompt for the AI. It controls how articles are summarized and what's considered relevant.

### Template (English)

```markdown
## Role
You are a tech analyst for our engineering team.

## Company Context
- Industry: [e.g., fintech, e-commerce, SaaS, gaming]
- Backend: [e.g., Java/Kubernetes, Python/Django, Go/microservices]
- Frontend: [e.g., React/Next.js on Vercel, Vue/Nuxt on Netlify]
- Infrastructure: [e.g., AWS, GCP, Cloudflare Workers]
- Team: [N] engineers
- Current focus areas: [e.g., observability, cost optimization, AI adoption]

## What to Focus On
- Infrastructure and edge computing
- AI/ML tooling for dev teams
- Build tools and DX improvements
- Security relevant to our industry
- Observability and monitoring
- Our tech stack ecosystem (e.g., Java, Cloudflare, React)

## Ignore
- Consumer gadget news
- Generic startup funding (unless directly relevant)
- Crypto/blockchain (unless relevant to payments)
- Mobile app development (if not applicable)

## Output Format
For each article provide:
1. **Summary** — 2-3 sentences, what happened
2. **Relevance** — why this specifically matters for us
3. **Action items** — concrete next steps, or "FYI" if informational

## Preferences
- Language: English
- Tone: direct, technical, no fluff
- If an article isn't relevant to us, say so briefly and move on
```

### Template (Localized Variant)

Use this template when you want the bot to respond in a language other than English. Structure is identical to the English template above — adjust the language preference in the **Preferences** section.

```markdown
## Role
You are a tech analyst for our engineering team.

## Company Context
- Industry: [your industry]
- Backend: [stack]
- Frontend: [stack]
- Infrastructure: [stack]
- Team: [N] engineers
- Current priorities: [what matters now]

## What to Focus On
- Infrastructure and edge computing
- AI/ML tooling for development teams
- Build tools and DX improvements
- Security relevant to our industry
- Observability and monitoring
- Our tech stack ecosystem

## Ignore
- Consumer gadgets
- Startup funding rounds (unless directly relevant)
- Crypto/blockchain (unless relevant to payments)

## Output Format
For each article:
1. **Summary** — 2-3 sentences, what happened
2. **For us** — why this specifically matters for our company
3. **Action items** — concrete next steps, or "FYI"

## Preferences
- Language: [your preferred language]
- Tone: direct, technical, no fluff
- If an article isn't relevant — say so briefly and move on
```

---

## Canvas: "Sources"

This canvas lists URLs for the daily digest. One URL per line in markdown list format. The bot parses lines starting with `- http`.

### Template: General Tech

```markdown
## Daily Sources

### Aggregators
- https://hnrss.org/best?count=30

### Cloud & Infrastructure
- https://blog.cloudflare.com/rss/
- https://aws.amazon.com/blogs/aws/feed/
- https://cloud.google.com/blog/rss

### Engineering Blogs
- https://engineering.atspotify.com/feed/
- https://netflixtechblog.com/feed
- https://github.blog/feed/
- https://discord.com/blog/rss.xml

### Frontend & Web
- https://vercel.com/blog/rss.xml
- https://developer.chrome.com/blog/feed.xml
- https://web.dev/feed.xml

### Dev Tools & Industry
- https://www.infoq.com/feed/
- https://feeds.feedburner.com/TechCrunch/startups
```

### Template: Java/JVM Focused

```markdown
## Daily Sources

### Aggregators
- https://hnrss.org/best?count=30

### Java & JVM
- https://inside.java/feed/
- https://spring.io/blog.atom
- https://blog.jetbrains.com/idea/feed/

### Infrastructure
- https://blog.cloudflare.com/rss/
- https://kubernetes.io/feed.xml

### Engineering
- https://engineering.atspotify.com/feed/
- https://netflixtechblog.com/feed
- https://github.blog/feed/
```

### Template: AI/ML Focused

```markdown
## Daily Sources

### Aggregators
- https://hnrss.org/best?count=30

### AI & ML
- https://blog.anthropic.com/rss
- https://openai.com/blog/rss/
- https://blog.google/technology/ai/rss/
- https://huggingface.co/blog/feed.xml

### Infrastructure
- https://blog.cloudflare.com/rss/

### Engineering
- https://github.blog/feed/
- https://netflixtechblog.com/feed
```

---

## Tips

- **Headers in Sources canvas** (like `### Aggregators`) are ignored by the bot — use them for your own organization
- **Comments**: lines not starting with `- http` are ignored — you can add notes
- **Order doesn't matter** — Claude picks the most relevant regardless of source order
- **Add/remove sources** by editing the canvas — takes effect on next digest run, no deploy needed
- **Prompt changes** take effect immediately on the next auto-summarize or digest
