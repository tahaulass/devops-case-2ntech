# 2NTECH DevOps Teknik Case – Çözüm

Bu repository, başlangıç MERN uygulamasının ve Python ETL'in analiz edilip düzeltilmiş, container'laştırılmış ve Kubernetes'e (CI/CD, saatlik ETL, yedekleme/geri yükleme ve gözlemlenebilirlik ile) taşınmış halini içerir.

**Ana doküman İngilizcedir:** [README_EN.md](README_EN.md) – mimari, kurulum, test, deployment, rollback, temizlik ve sorun giderme.

| Doküman | İçerik |
| --- | --- |
| [README_EN.md](README_EN.md) | Kurulum ve işletim adımları |
| [docs/architecture.md](docs/architecture.md) | Mimari ve istek akışı diyagramları |
| [docs/findings.md](docs/findings.md) | Tespit edilen sorunlar, önem derecesi, çözüm, kapsam dışı maddeler |
| [docs/backup-restore.md](docs/backup-restore.md) | Yedekleme/geri yükleme runbook'u |
| [CASE_END_ANSWERS.md](CASE_END_ANSWERS.md) | Case sorularının cevapları |
| [SUBMISSION_EVIDENCE.md](SUBMISSION_EVIDENCE.md) | Ekran görüntüleri ve açıklamaları |

Hızlı başlangıç (Docker Desktop Kubernetes):

```powershell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
docker build -t devops-case/backend:local  mern-project/server
docker build -t devops-case/frontend:local mern-project/client
docker build -t devops-case/etl:local      python-project
.\scripts\create-secrets.ps1
kubectl apply -k k8s/overlays/dev
start http://mern.localhost
```
