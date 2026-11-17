# Adam Langmeyer

Palo Alto, CA · redacted@example.invalid · github.com/citizenadam
Open to remote, or hybrid in the Bay Area. US citizen, no sponsorship required.

## Summary

IT leader and hands-on engineer. Fifteen years owning enterprise IT end to end —
roadmap, ~$2.5M budget, 20 direct reports, 99.999% uptime across 15,000+
properties — then back to building production LLM and agentic systems on
Kubernetes, Terraform, and Go.

## Experience

### Principal — Vector Point Capital (quantitative trading systems)
Jan 2025 to present

- Architecture, delivery, and production operations for enterprise clients
  integrating LLM and agentic systems into business-critical workflows, from
  scoping through run-state handoff.
- Full-stack scheduling platform in React (TypeScript) and Gin (Go) with
  real-time booking synchronization across distributed systems.
- Claude integration for natural-language customer intake, cutting manual
  scheduling workload by 95%; autonomous booking agents handling conflict
  resolution, payment, and scheduling.
- LLM serving and orchestration end to end: evaluation, monitored rollouts, and
  fine-tuning on domain-specific client workloads.
- Distributed option-chain capture in Go: concurrent redundant streams, Parquet
  buffer that survives a database outage, after-hours backfill. 99% gap-free
  seconds, ~1 TB/year per chain after columnar compression.
- Financial news sentiment service: FinBERT on CPU through ONNX, with a custom
  weighting layer built after measuring VADER at roughly 80% positive on
  financial text. TimescaleDB event store with full-history point-in-time
  rebuild under 500ms.
- Kubernetes across managed EKS, managed OCI, and self-hosted Talos on bare
  metal. Terraform for full environments, Flux for GitOps reconciliation.

### Director of Information Technology — US Home Rentals
Oct 2018 to Dec 2024

- Owned enterprise IT for the organization: roadmap, ~$2.5M annual budget,
  delivery, security posture, and availability for systems supporting 15,000+
  properties (~$18M/month flow), reporting to executive leadership.
- Hired and led all 20 direct reports (2 helpdesk, 18 engineering); 60+ career
  hires with 2-4 managed out. ~95% of work delegated through Jira and GitHub.
- 95% on-time, on-budget delivery across 60-100 projects with only short Sunday
  change windows in a national always-on operation.
- 70 TB across three engines: ~20 TB operational (MySQL on RDS, PostgreSQL) plus
  a 50 TB MSSQL financial-reporting repository behind Dynamics/365, with read
  replicas serving 100K+ users at 99.999% uptime.
- Production IaC across three clusters and a SOX/ITIL security program:
  quarterly risk assessments, penetration tests, DR/BCP, 1,000+ incident and
  change tickets per month in Jira Service Management.
- Led the day-one COVID merge to 100% Azure cloud-native, personally handling
  phone, internet, and service contract migrations. Cut run-rate ~$199K/yr
  (~$144K telecom, ~$55K Google Workspace).
- Weekly executive report and department newsletter; staff development through
  paid training, college-credit courses, and conference travel.

### Information Technology Manager — Vision Property Management
Feb 2013 to Oct 2018

- ERP program manager for the full tenure, plus change and deployment
  management; led a ~20-person mixed team through GitOps, GitHub, and Jira.
- Consolidated Peachtree, QuickBooks, SAP, and manual spreadsheets across ten
  accounts — books months to years behind on process, compliance, tax, and
  investor reporting — into a designed financial-planning and accounting system
  in Microsoft Dynamics.
- Built a full-cloud AWS SaaS ERP covering the property-management workflow at
  ~20K customer accounts peak, plus 187 investment companies and three
  REIT/hedge-fund accounts.
- Shipped four owned products: vbase (core PM), vops (contractor bidding and
  ticketing, 1M+ contracts completed), vpeople (CRM integrated with the phone
  system), and vdataroom (investor packages with cross-investor
  confidentiality), plus per-party dynamic contract generation.
- Delivered a year-two office purchase and relocation of 250 people with
  zero-day business outage.
- Owned the endpoint fleet (hundreds of ChromeOS devices, zero-touch
  enrollment) and owner-company integrations for payments and insurance.

### Network Analyst — First Citizens Bank
Nov 2009 to Feb 2013

- Scalable enterprise network architecture across multiple sites (Cisco,
  Juniper) supporting 12,000+ end users.
- Dynamic routing (BGP, OSPF, EIGRP), VLAN switching, next-generation firewalls
  (Palo Alto, Fortinet, Check Point), site-to-site and client VPNs.
- Large-scale Cisco wireless deployments with survey analysis; QoS for VoIP and
  video; monitoring with SolarWinds, Wireshark, and PRTG.
- Automated provisioning with Python and Ansible, cutting manual configuration
  time by 40%. Led on-premises to AWS/Azure migration.

## Education

A.S. Computer Networking — Midlands Technical College, 2008

## Certifications

- AWS Certified Solutions Architect - Associate (2020)
- Certified Kubernetes Administrator (2020)
- ITIL 4 Foundation (2020)

## Skills

Go (Gin), TypeScript, React, Python; PostgreSQL, TimescaleDB, MySQL, MSSQL,
Redis, DynamoDB; Kubernetes (EKS, OCI, Talos), Terraform, Flux, Docker, Helm,
Ansible; AWS (Lambda, DynamoDB, S3, CloudFront, API Gateway, EKS, RDS), Azure,
OCI; Prometheus, Grafana, Loki, Pyroscope, Jaeger, OpenTelemetry; LLM
integration, agentic systems, MLOps, model fine-tuning; BGP/OSPF/EIGRP, NGFW,
IPsec/SSL VPN, IAM/SSO/MDM, DR/BCP.

## Benchmarks and side work

- Agent evaluation harness: mechanical completion gates, cost per valid pass,
  held-out oracles, coverage receipts. Source and data at
  citizenadam.github.io/data/bench/.
- Go LLM training corpus: curated v1.18+ Go repositories for code-completion
  fine-tuning.
