// The record Jev reads. Facts only, no adjectives, no pronouns: the same
// standard as cv.md. Anything absent here is absent from the answer.

export const STATE = {
  candidate: {
    name: "Adam Langmeyer",
    location: "Palo Alto, California",
    availability: "open to remote",
    target_roles: [
      "IT leadership",
      "platform or infrastructure engineering leadership",
      "AI systems engineering"
    ],
    summary:
      "Fifteen years running enterprise IT, including six years as Director of IT for a national property portfolio, followed by independent work building production Go and Kubernetes systems and LLM features."
  },

  roles: [
    {
      org: "Vector Point Capital",
      title: "Principal",
      years: "2025-present",
      scope: {
        kind: "independent consulting and product engineering"
      },
      delivered: [
        "distributed option-chain capture in Go: concurrent streams, a Parquet write buffer that survives a database outage, and after-hours backfill; 99% gap-free seconds, roughly 1 TB per year per chain after columnar compression",
        "news sentiment service: FinBERT on CPU through ONNX, with a weighting layer added after measuring that VADER scores roughly 80% positive on financial text",
        "Kubernetes across managed EKS, managed OCI, and self-hosted Talos on bare metal; Terraform for whole environments, Flux reconciling drift",
        "production LLM and agentic systems for enterprise clients"
      ]
    },
    {
      org: "US Home Rentals",
      title: "Director of IT",
      years: "2018-2024",
      scope: {
        budget_usd_per_year: 2500000,
        direct_reports: 20,
        properties_served: 15000,
        availability: "99.999%",
        monthly_transaction_flow_usd: 18000000
      },
      delivered: [
        "operated 70 TB across MySQL on RDS, PostgreSQL, and 50 TB of MSSQL partitioned behind Dynamics, with read replicas serving 100,000+ users",
        "cut roughly $199,000 per year from run-rate, including $144,000 in telecom and $55,000 in Google Workspace, without reducing service levels",
        "moved the company to 100% Azure cloud-native at the start of COVID and handled the contract migrations personally",
        "delivered 95% of 60-100 projects on time and on budget"
      ]
    },
    {
      org: "Vision Property Management",
      title: "IT Manager and ERP Project Manager",
      years: "2013-2018",
      scope: {
        customer_accounts_at_peak: 20000,
        investment_companies: 187,
        institutional_accounts: 3
      },
      delivered: [
        "consolidated Peachtree, QuickBooks, SAP, and manual spreadsheets into Microsoft Dynamics, then built the property-management workflow as a cloud ERP on AWS",
        "shipped four owned products: core property management (vbase), contractor bidding (vops, over 1,000,000 contracts completed), a phone-integrated CRM, and an investor data room with cross-investor confidentiality",
        "moved 250 people through an office acquisition with zero days of business outage"
      ]
    }
  ],

  skills_demonstrated: [
    "Go", "TypeScript", "React", "Python", "PostgreSQL", "TimescaleDB", "MSSQL",
    "MySQL", "Kubernetes", "Talos", "Terraform", "Flux", "Docker", "Azure",
    "AWS", "OCI", "Prometheus", "Grafana", "ONNX", "LLM integration",
    "technical hiring and team management", "budget ownership", "vendor negotiation"
  ],

  credentials: [
    "AWS Certified Solutions Architect - Associate",
    "Certified Kubernetes Administrator",
    "ITIL 4 Foundation"
  ],

  not_evidenced: [
    "no mobile application development in a professional role",
    "no team larger than 20 people managed directly",
    "no security certification beyond the three listed",
    "no data-science degree or published research",
    "no front-end design or brand work beyond personal projects"
  ]
};
