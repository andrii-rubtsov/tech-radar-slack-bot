# TechRadar Canvas — Configuration Reference

## Overview

Single canvas per channel. Create a canvas tab in your channel and name it exactly: **`TechRadar`** (case-sensitive).

The canvas content is TOML. The bot reads it on every event — edit the canvas and changes take effect immediately with no redeploy.

To get started quickly, run `/tech-radar-setup` in any channel where the bot is present.

---

## Full Example — Engineering Team (Java / Fintech)

```toml
# ─────────────────────────────────────────────
#  TechRadar — channel configuration
#  Canvas name must be exactly: TechRadar
#
#  Slash commands (always work, ignore [features] settings):
#    /tech-radar-setup
#        Print this config template + canvas setup instructions (only you see it)
#    /tech-radar-summarize [optional note] <url>
#        Fetch and summarize a URL, post result to channel
#    /tech-radar-digest
#        Trigger today's digest immediately, post result to channel
# ─────────────────────────────────────────────

[context]
role     = "Tech analyst for our engineering team"
industry = "Fintech / B2C payments"
language = "English"
tone     = "direct, technical, no fluff"

# Keys here are arbitrary — use whatever labels make sense for your team.
# Engineering:  backend / frontend / infra / observability / cicd
# Data / BI:    warehouse / transformation / orchestration / visualization
# DevOps:       orchestration / iac / monitoring / secrets
# Frontend:     framework / styling / state / testing / hosting
[tech_stack]
backend       = "Java 21 / Spring Boot 3.x on Kubernetes (AWS EKS)"
frontend      = "React 18 / Next.js 14 on Vercel"
data          = "PostgreSQL 16, Redis 7, Apache Kafka (AWS MSK)"
infra         = "AWS (EKS, RDS, MSK, S3), Cloudflare Workers for edge APIs"
observability = "Datadog, OpenTelemetry, PagerDuty"
cicd          = "GitHub Actions, ArgoCD"

# ── Features ──────────────────────────────────
# Set to false to disable without removing config

[features]
auto_summary = true   # bot reacts to links posted in channel
digest       = true   # bot posts daily digest from [[digest.source]] list

# ── What to watch ─────────────────────────────

[filter]
focus = [
  "Java / Spring ecosystem",
  "Kubernetes and container orchestration",
  "Cloud cost optimization",
  "AI/ML for production systems",
  "Kafka and event streaming",
  "Security and compliance tooling",
  "Cloudflare and edge computing",
]
ignore = [
  "Consumer gadget news",
  "Mobile-only development",
  "Crypto / blockchain",
  "Generic startup funding rounds",
]

# ── Relevance sections ────────────────────────
# Add as many [[relevance]] blocks as you need.
# Each becomes a rated section (⭐ 1–5) in the bot's output.

[[relevance]]
name        = "Tech Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our current tools, libraries, and platforms listed above"

[[relevance]]
name        = "OKRs"
emoji       = "🎯"
sentences   = 2
description = """
Q1 2026 objectives:
- Reduce p99 API latency below 200ms
- Cut AWS infrastructure cost by 15%
- Ship AI-powered transaction categorization to 100% of users
- Achieve SOC 2 Type II certification
"""

# ── Output format ─────────────────────────────

[output]
summary_sentences = 3     # sentences in the 📝 Summary section
adoption_path     = true  # include 🚀 Adoption Path section

# ── Daily digest sources ──────────────────────
# Only used when features.digest = true

[digest]
top_n = 5   # how many articles Claude picks per digest

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News Best"

[[digest.source]]
url   = "https://inside.java/feed/"
label = "Inside Java"

[[digest.source]]
url   = "https://spring.io/blog.atom"
label = "Spring Blog"

[[digest.source]]
url   = "https://blog.cloudflare.com/rss/"
label = "Cloudflare Blog"

[[digest.source]]
url   = "https://kubernetes.io/feed.xml"
label = "Kubernetes Blog"

[[digest.source]]
url   = "https://aws.amazon.com/blogs/aws/feed/"
label = "AWS Blog"

[[digest.source]]
url   = "https://netflixtechblog.com/feed"
label = "Netflix Tech Blog"

[[digest.source]]
url   = "https://github.blog/feed/"
label = "GitHub Blog"
```

---

## Full Example — Data / BI Team

```toml
[context]
role     = "Tech analyst for our data engineering team"
industry = "E-commerce / retail analytics"
language = "English"
tone     = "direct, technical"

[tech_stack]
warehouse      = "Snowflake (Enterprise)"
transformation = "dbt Core 1.8 on Airflow"
orchestration  = "Apache Airflow 2.x on MWAA"
visualization  = "Looker, Tableau"
streaming      = "Kafka, Confluent Cloud"
infra          = "AWS (S3, Glue, Redshift Spectrum)"

[features]
auto_summary = true
digest       = true

[filter]
focus = [
  "Data warehouse and lakehouse architecture",
  "dbt and SQL transformation patterns",
  "Airflow and workflow orchestration",
  "Data quality and observability",
  "Real-time analytics and streaming",
  "BI tooling and visualization",
  "AI/ML for data teams",
]
ignore = [
  "Frontend web development",
  "Mobile development",
  "Crypto / blockchain",
  "Consumer hardware",
]

[[relevance]]
name        = "Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our Snowflake/dbt/Airflow/Looker stack"

[[relevance]]
name        = "Data Goals"
emoji       = "🎯"
sentences   = 2
description = """
Q1 2026 priorities:
- Reduce dbt model run times by 30%
- Implement data contracts for all tier-1 models
- Ship real-time inventory dashboard (sub-5min latency)
- Migrate 20 legacy ETL jobs to dbt
"""

[output]
summary_sentences = 3
adoption_path     = true

[digest]
top_n = 5

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News Best"

[[digest.source]]
url   = "https://www.getdbt.com/blog/rss"
label = "dbt Blog"

[[digest.source]]
url   = "https://medium.com/feed/airbnb-engineering"
label = "Airbnb Engineering"

[[digest.source]]
url   = "https://netflixtechblog.com/feed"
label = "Netflix Tech Blog"

[[digest.source]]
url   = "https://engineering.atspotify.com/feed/"
label = "Spotify Engineering"

[[digest.source]]
url   = "https://aws.amazon.com/blogs/big-data/feed/"
label = "AWS Big Data Blog"
```

---

## Full Example — DevOps / Platform Team

```toml
[context]
role     = "Tech analyst for our platform engineering team"
industry = "SaaS / developer tools"
language = "English"
tone     = "direct, technical, no fluff"

[tech_stack]
orchestration = "Kubernetes 1.29 on EKS, Helm 3"
iac           = "Terraform, AWS CDK"
cicd          = "GitHub Actions, ArgoCD, Tekton"
monitoring    = "Prometheus, Grafana, OpenTelemetry"
secrets       = "HashiCorp Vault, AWS Secrets Manager"
networking    = "Cilium, Istio service mesh"
registry      = "AWS ECR, Harbor"

[features]
auto_summary = true
digest       = true

[filter]
focus = [
  "Kubernetes releases and ecosystem",
  "Infrastructure as Code patterns",
  "CI/CD and GitOps practices",
  "Platform engineering and developer experience",
  "FinOps and cloud cost optimization",
  "Security and supply chain hardening",
  "Observability and incident response",
]
ignore = [
  "Consumer gadgets",
  "Frontend frameworks",
  "Crypto / blockchain",
  "Marketing and business news",
]

[[relevance]]
name        = "Platform Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our Kubernetes/Terraform/ArgoCD/Prometheus stack"

[[relevance]]
name        = "Platform OKRs"
emoji       = "🎯"
sentences   = 2
description = """
Q1 2026 objectives:
- Reduce developer self-service time to production from 3 days to 4 hours
- Achieve 99.95% cluster uptime SLA
- Cut cloud spend by 20% via rightsizing and spot instances
- Complete SOC 2 Type II audit
"""

[output]
summary_sentences = 3
adoption_path     = true

[digest]
top_n = 5

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News Best"

[[digest.source]]
url   = "https://kubernetes.io/feed.xml"
label = "Kubernetes Blog"

[[digest.source]]
url   = "https://www.cncf.io/blog/feed/"
label = "CNCF Blog"

[[digest.source]]
url   = "https://blog.cloudflare.com/rss/"
label = "Cloudflare Blog"

[[digest.source]]
url   = "https://aws.amazon.com/blogs/containers/feed/"
label = "AWS Containers Blog"

[[digest.source]]
url   = "https://github.blog/feed/"
label = "GitHub Blog"

[[digest.source]]
url   = "https://www.hashicorp.com/blog/feed.xml"
label = "HashiCorp Blog"
```

---

## Full Example — AI/ML Team

```toml
[context]
role     = "Tech analyst for our AI/ML engineering team"
industry = "Consumer tech / personalization"
language = "English"
tone     = "direct, technical"

[tech_stack]
frameworks   = "PyTorch 2.x, Hugging Face Transformers, LangChain"
serving      = "Ray Serve, Triton Inference Server on Kubernetes"
training     = "AWS SageMaker, NVIDIA A100/H100 clusters"
orchestration = "Prefect, Airflow for ML pipelines"
data         = "Feature store: Feast; Vector DB: Weaviate, pgvector"
monitoring   = "Arize AI, MLflow, Weights & Biases"

[features]
auto_summary = true
digest       = true

[filter]
focus = [
  "LLM architecture and fine-tuning",
  "Inference optimization and serving",
  "RAG and vector search",
  "ML observability and evaluation",
  "Multimodal models",
  "AI safety and alignment",
  "Open-source model releases",
]
ignore = [
  "Crypto / blockchain",
  "Consumer gadgets",
  "Frontend web development",
  "Generic business news",
]

[[relevance]]
name        = "ML Stack"
emoji       = "🤖"
sentences   = 2
description = "How this relates to our PyTorch/HuggingFace/Ray/Weaviate stack"

[[relevance]]
name        = "AI Product Goals"
emoji       = "🎯"
sentences   = 2
description = """
Q1 2026 objectives:
- Improve recommendation CTR by 8% via LLM-based personalization
- Reduce inference p99 latency from 400ms to 150ms
- Ship multimodal product search (image + text) to 50% of users
- Evaluate and adopt open-source alternative to current proprietary embedding model
"""

[output]
summary_sentences = 3
adoption_path     = true

[digest]
top_n = 5

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News Best"

[[digest.source]]
url   = "https://blog.anthropic.com/rss"
label = "Anthropic Blog"

[[digest.source]]
url   = "https://openai.com/blog/rss/"
label = "OpenAI Blog"

[[digest.source]]
url   = "https://huggingface.co/blog/feed.xml"
label = "Hugging Face Blog"

[[digest.source]]
url   = "https://ai.googleblog.com/feeds/posts/default"
label = "Google AI Blog"

[[digest.source]]
url   = "https://netflixtechblog.com/feed"
label = "Netflix Tech Blog"

[[digest.source]]
url   = "https://github.blog/feed/"
label = "GitHub Blog"
```

---

## Minimal Example (quick start)

```toml
# ─────────────────────────────────────────────
#  TechRadar — channel configuration
#  Canvas name must be exactly: TechRadar
#
#  Slash commands (always work, ignore [features] settings):
#    /tech-radar-setup               → print this template (only you see it)
#    /tech-radar-summarize [note] <url>  → summarize URL, post to channel
#    /tech-radar-digest              → trigger digest now, post to channel
# ─────────────────────────────────────────────

[context]
industry = "Your industry"
language = "English"
tone     = "direct, technical"

# Keys are arbitrary — use whatever labels fit your team
[tech_stack]
backend = "Your backend stack"
infra   = "Your infrastructure"

[features]
auto_summary = true
digest       = true

[filter]
focus  = ["topics you care about"]
ignore = ["noise to skip"]

[[relevance]]
name        = "Tech Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our current tools"

[[relevance]]
name        = "Goals"
emoji       = "🎯"
sentences   = 2
description = "Our current team priorities or OKRs"

[output]
summary_sentences = 3
adoption_path     = true

[digest]
top_n = 5

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News"
```

---

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `[context].*` | string | any one | Freeform context passed to Claude |
| `[context].language` | string | no | Response language (default: English) |
| `[context].tone` | string | no | Response tone |
| `[tech_stack].*` | string | no | Freeform stack description — any key names |
| `[features].auto_summary` | bool | no | React to links in channel (default: true) |
| `[features].digest` | bool | no | Run daily digest (default: true) |
| `[filter].focus` | string[] | no | Topics to prioritize |
| `[filter].ignore` | string[] | no | Topics to skip |
| `[[relevance]].name` | string | yes | Section heading |
| `[[relevance]].emoji` | string | yes | Emoji prefix for section |
| `[[relevance]].sentences` | int | yes | How many sentences Claude writes |
| `[[relevance]].description` | string | yes | What to evaluate relevance against |
| `[output].summary_sentences` | int | no | Sentences in Summary (default: 3) |
| `[output].adoption_path` | bool | no | Include Adoption Path section (default: true) |
| `[digest].top_n` | int | no | Articles to pick per digest (default: 5) |
| `[[digest.source]].url` | string | yes | RSS/feed URL |
| `[[digest.source]].label` | string | no | Human label (informational) |
