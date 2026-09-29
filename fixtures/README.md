# Fixtures: the Quaylark sample corpus

The sample documents and the evaluation questions.

## The company is fictional

Quaylark Systems, Inc. is an invented B2B SaaS company (about 430 employees, offices in Toronto, Rotterdam and Singapore) that sells a dock appointment scheduling and yard management platform to warehouses, third-party logistics providers and carriers. Every person is a role (Head of Security, Data Protection Officer, and so on), and every domain uses the reserved `.example` or `.test` top-level domains. Any resemblance to a real company is accidental.

## What is here

| Path                                           | What it is                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `corpus/employee-handbook.md`                  | Working hours, leave (annual, sick, parental), remote work, employee retention programs               |
| `corpus/travel-and-expense-policy.md`          | Per diems and lodging caps by region, expense category codes, approval thresholds                     |
| `corpus/security-incident-response-runbook.md` | Severity levels SEV1 to SEV4, on-call rotation, escalation contacts, response checklist               |
| `corpus/product-api-specification.md`          | Public API v3: authentication, rate limits per plan, webhooks, retry policy, errors                   |
| `corpus/pricing-and-plans.md`                  | Plans with PLN codes and prices, add-ons, discounts, renewals                                         |
| `corpus/customer-support-sla.md`               | Priorities P1 to P4, response and resolution targets, support hours by time zone, service credits     |
| `corpus/engineering-onboarding-guide.md`       | Local setup commands, repository conventions, code review rules, deploys                              |
| `corpus/data-retention-and-privacy-policy.md`  | Retention periods per data type, deletion process, DSAR handling                                      |
| `questions.template.json`                      | Six example evaluation questions that show the format                                                 |
| `questions.json`                               | The real evaluation set: 40 questions, 5 per document, generated with Claude (an LLM) from the corpus |
| `verify-questions.mjs`                         | Checks that every answer is copied exactly from its document                                          |

The documents are 1,000 to 1,400 words each, use `#`, `##` and `###` headings, and contain tables and fenced code blocks. Facts are consistent across documents: for example, the Growth plan (PLN-GROWTH-24) costs 449 USD per site per month and allows 300 API requests per minute wherever it is mentioned.

## How the corpus is used

- `npm run seed` loads the eight documents into the demo account, so a fresh install has something to search and chat with.
- `npm run eval` runs every question in `questions.json` against each combination of chunking strategy (naive fixed-size, structure-aware) and retrieval mode (vector, keyword, hybrid). A question is a hit at rank k when a retrieved chunk from the right `document` contains the `answer` span; the report gives hit rates and mean reciprocal rank per combination in [docs/EVAL.md](../docs/EVAL.md).

The corpus includes cases that separate the strategies on purpose: the same word with different meanings in different documents ("retention", "escalation", "limits"), a `### Limits` section in both the API specification and the expense policy, exact codes such as `EXP-TRV-04`, `PLN-GROWTH-24` and `SEV2`, facts that live only in a table cell, and facts that live only in a comment inside a code block.

## Format of `questions.json`

A JSON array. Each entry has five string fields:

```json
[
  {
    "id": "q01",
    "question": "What does expense code EXP-TRV-04 cover?",
    "document": "travel-and-expense-policy.md",
    "answer": "Meals and incidentals per diem",
    "type": "exact-code"
  }
]
```

- `id`: unique, for example `q01` to `q40`.
- `question`: what a user would type into the chat.
- `document`: the file name in `corpus/` that holds the answer (the file name only, no folder).
- `answer`: a span of 2 to 12 words copied character for character from that document, unique enough to identify the right chunk, and inside a single table cell or line.
- `type`: one of `exact-code`, `table`, `nested-heading`, `ambiguous-term`, `code-block`, `paraphrase`.

| Type             | Meaning                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `exact-code`     | The question hinges on an identifier such as `EXP-TRV-04`, `PLN-SCALE-24`, `ADD-SUP-04`, `SEV3` |
| `table`          | The answer sits in a table cell                                                                 |
| `nested-heading` | The answer sits under a generic heading (like `Limits`) that only makes sense with the document |
| `ambiguous-term` | The key word means different things in different documents                                      |
| `code-block`     | The answer is inside a fenced code block, often in a comment                                    |
| `paraphrase`     | The question uses different words from the document                                             |

## Checking the questions

Run from the repository root:

```bash
node fixtures/verify-questions.mjs                       # checks questions.json, or the template if it does not exist yet
node fixtures/verify-questions.mjs fixtures/questions.template.json
```

It uses Node built-ins only and fails (exit code 1) when the JSON is malformed, an id is repeated, a type is unknown, a document does not exist, or an answer is not found verbatim in its document. It warns without failing when an answer is shorter than 2 or longer than 12 words, appears more than once in its document, also appears in another document, or is contained in the question itself. It ends with a count of questions per type and per document.

If you edit a corpus document after writing questions, run the script again: a changed sentence can break an answer span.
