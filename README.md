# 2NTECH DevOps Teknik Case

Case gereksinimleri, teslim kapsamı ve değerlendirme bilgileri için **`DevOps_Teknik_Case_TR.docx`** dosyasını okuyun.

> Başlangıç uygulamaları bilinçli olarak production-readiness sorunları içermektedir. Uygulama kodundaki mevcut davranışlar doğru kabul edilmemeli; adayın kritik sorunları analiz etmesi, önceliklendirmesi ve gerekli iyileştirmeleri dokümante etmesi beklenmektedir.

## Proje yapısı

- `mern-project/`: React frontend, Express.js backend ve MongoDB kullanan başlangıç uygulaması
- `python-project/`: Başlangıç Python ETL iş yükü ve sınırlı ETL gereksinimleri
- `DevOps_Teknik_Case_TR.docx`: Ana case dokümanı
- `CASE_SONU_CEVAPLARI.md`: Teslim sırasında cevaplanması gereken soru şablonu
- `TESLIM_KANITLARI.md`: Zorunlu ekran görüntüsü ve çalışma kanıtı şablonu
- `docs/backup-restore.md`: Yedekleme ve geri yükleme runbook şablonu (aday tarafından doldurulur)
- `docs/screenshots/`: Teslim ekran görüntülerinin konulacağı klasör

## Ortam seçimi

Çözüm bir public cloud üzerinde veya adayın oluşturduğu Linux sanal makine üzerinde çalıştırılabilir. Cloud kullanımı zorunlu değildir. VM üzerinde k3s, microk8s veya kubeadm gibi bir Kubernetes dağıtımı kullanılabilir.

## Temel fonksiyonel beklentiler

- MERN uygulamasının temel kullanıcı akışları ve API fonksiyonları çalışmalıdır.
- Python ETL, GitHub API üzerinden repository bilgilerini otomatik olarak almalı ve MongoDB’ye yazmalıdır.
- Aynı repository sonraki ETL çalışmalarında tekrar geldiğinde yeni kayıt oluşturulmamalı; mevcut kayıt benzersiz repository bilgisi üzerinden güncellenmelidir.
- Python ETL saatte bir çalıştırılmalıdır.
- MongoDB verisi için yedekleme ve geri yükleme uygulanmalı; kayıt oluşturma, yedek alma, veriyi silme, yedekten geri yükleme ve verinin geri geldiğinin doğrulanması adımları uçtan uca çalıştırılıp kanıtlanmalıdır.
- Kurulum, deployment, rollback, backup/restore ve temizlik adımları repository içinde dokümante edilmelidir.
- Repository içerisinde gerçek credential veya secret bulunmamalıdır.
- Çalışan sisteme ait zorunlu ekran görüntüleri `docs/screenshots/` altında paylaşılmalı ve `TESLIM_KANITLARI.md` içinde açıklanmalıdır.

Ayrıntılı ana kriterler, üst kriterler, teslim kanıtları ve case sonu soruları Word dokümanında yer almaktadır.
