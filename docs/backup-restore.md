# Backup & Restore Runbook

Bu dosya aday tarafından doldurulur. / This file is to be filled in by the candidate.

Kanıt ekran görüntüleri `TESLIM_KANITLARI.md` (TR) veya `SUBMISSION_EVIDENCE.md` (EN) dosyasından referanslanmalıdır.
Evidence screenshots must be referenced from `TESLIM_KANITLARI.md` (TR) or `SUBMISSION_EVIDENCE.md` (EN).

---

## 1. Yaklaşım / Approach

| | |
| --- | --- |
| Yedekleme yöntemi / Backup method | |
| Nasıl çalıştırılıyor / Execution method (script, Job, CronJob, manuel) | |
| Yedeğin saklandığı konum / Backup storage location | |
| Yedek formatı ve boyutu / Backup format and size | |
| Sıklık / Frequency | |
| Retention süresi / Retention period | |
| Şifreleme ve erişim kontrolü / Encryption and access control | |

## 2. Hedefler / Targets

| | Hedef / Target | Ölçülen / Measured |
| --- | --- | --- |
| RPO | | |
| RTO | | |

## 3. Yedek alma adımları / Backup procedure

```bash
# komutlar / commands
```

## 4. Geri yükleme adımları / Restore procedure

```bash
# komutlar / commands
```

## 5. Doğrulama / Verification

Yedeğin bozuk veya eksik olmadığı nasıl doğrulanıyor?
How is it verified that the backup is not corrupted or incomplete?

## 6. Uçtan uca test sonucu / End-to-end test result

Aşağıdaki senaryonun çalıştırıldığı tarih ve sonuç:
Date and result of the executed scenario:

| # | Adım / Step | Sonuç / Result | Kanıt / Evidence |
| --- | --- | --- | --- |
| 1 | Kayıt oluşturuldu / Record created | | |
| 2 | Yedek alındı / Backup taken | | |
| 3 | Collection/DB silindi / Collection or DB dropped | | |
| 4 | Verinin kaybolduğu görüldü / Data confirmed gone | | |
| 5 | Yedekten geri yüklendi / Restored from backup | | |
| 6 | Veri geri geldi / Data confirmed back | | |

## 7. Bilinen sınırlamalar / Known limitations

Bu çözümün production ortamında eksik kalan yönleri ve nasıl geliştirileceği.
Gaps of this solution in a production environment and how you would improve it.
