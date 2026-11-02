# CASE END ANSWERS

Answer all questions below by relating them directly to your implementation.

Answers should be concise, specific, and detailed enough to explain your technical decisions. Where appropriate, reference the relevant source file, manifest, pipeline step, or document path.

---

## Candidate Information

- **Full name:**
- **Repository URL:**
- **Completion date:**
- **Target environment used:** Cloud / Virtual Machine / Local Kubernetes / Other

---

## 1. Architecture and Request Flow

Explain the architecture you implemented and the path a user request follows from the frontend through the backend to the database.

Also prepare an architecture diagram showing the system components, connections between components, traffic flow, and external access points, and add it to the project repository as one of the following:

- `docs/architecture.md`
- `docs/architecture.pdf`

The diagram may be created with Mermaid, Draw.io, Excalidraw, or a similar tool. Include the editable source file in the repository as well.

**Answer:**

---

## 2. Critical Findings and Prioritization

What were the three most critical issues you identified in the starter projects? Which impact and risk criteria did you use to prioritize them?

**Answer:**

---

## 3. Items Left Out of Scope

Which issues did you intentionally leave unresolved or out of scope? Explain the reasons for these decisions.

**Answer:**

---

## 4. Target Environment Selection

Why did you choose a cloud environment or a virtual machine? Which components or approaches would you use differently in a real production environment?

**Answer:**

---

## 5. MongoDB Approach

Why did you choose your MongoDB deployment and service approach? Explain the alternatives you considered, along with their advantages, disadvantages, and operational trade-offs.

**Answer:**

---

## 6. Helm or Manifest Management

If you used Helm, explain why you selected it and what problem it solves in this project.

Describe its advantages and the additional complexity it introduces compared with alternatives such as plain Kubernetes manifests or Kustomize.

If you did not use Helm, explain the method you selected and the reason for your choice.

**Answer:**

---

## 7. Kubernetes Service Types

Which criteria did you use to select Kubernetes Service types?

For each service, explain why you chose `ClusterIP`, `NodePort`, `LoadBalancer`, `ExternalName`, or a headless Service. State which services should be accessible from outside the cluster and how you prevented unnecessary external exposure.

**Answer:**

---

## 8. Kubernetes Workload Types

Which criteria did you use to select workload types for the application components?

Explain why you used `Deployment`, `StatefulSet`, `Job`, `CronJob`, or another workload type for the frontend, backend, MongoDB, and ETL components.

Describe how you evaluated the following:

- Stateless or stateful behavior
- Persistent-storage requirements
- Pod identity and ordered-execution requirements
- Execution frequency
- Restart behavior
- Scalability requirements

**Answer:**

---

## 9. Configuration and Secret Management

How did you manage application configuration and secrets?

When a secret value is changed or rotated, how would you ensure that the application securely starts using the new value?

**Answer:**

---

## 10. MongoDB Availability Failure

If MongoDB becomes unavailable, how will the backend application, readiness/liveness checks, and user requests behave?

What measures did you take, or would you take, to reduce user impact and allow the service to recover in a controlled manner?

**Answer:**

---

## 11. Faulty Deployment and Rollback

How would you detect a faulty deployment?

Which method would you use to roll it back, and how would you verify that the previous working version has been restored safely?

**Answer:**

---

## 12. Scalability and Bottlenecks

If traffic increases tenfold, where do you expect the first bottleneck to occur?

Which components would you scale, and based on which metrics and thresholds? Explain how you would evaluate database connections, resource usage, and dependent services.

**Answer:**

---

## 13. Logging, Monitoring, and Alerting

Which logs, metrics, and alerts did you create?

During an incident, which dashboards, logs, metrics, or alert records would you examine first to diagnose the problem?

**Answer:**

---

## 14. Security Risks

What are the three most important security risks in your solution?

Explain the controls you implemented, or would implement in production, to reduce these risks.

**Answer:**

---

## 15. Python ETL Record Update Behavior

When the Python ETL receives the same repository information again, how does it find and update the existing record?

Which field did you use as the unique record key, and which screenshot or output demonstrates that no duplicate was created?

**Answer:**

---

## 16. Backup and Restore Approach

Which backup method and storage location did you choose for MongoDB?

What are your backup frequency, retention period, RPO, and RTO targets, and what was the actual restore duration you measured?

How would you verify that a backup is not corrupted or incomplete, and how would you change this approach in a real production environment?

Provide your runbook in `docs/backup-restore.md` and reference the evidence from `SUBMISSION_EVIDENCE.md`.

**Answer:**

---

## Additional Notes

Use this section for any additional decisions, limitations, or future improvement steps that you would like to highlight.

**Answer:**
