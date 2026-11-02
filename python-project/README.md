# Python ETL Görevi

Sağlanan `ETL.py` dosyası başlangıç kodudur ve production-ready değildir. Adaydan bu kodu aşağıdaki sınırlı gereksinimleri karşılayacak şekilde geliştirmesi beklenmektedir:

1. GitHub API üzerinden repository bilgileri otomatik olarak alınmalıdır.
2. Alınan repository bilgileri MongoDB’ye kaydedilmelidir.
3. Aynı repository sonraki çalışmalarda tekrar alındığında yeni bir kayıt oluşturulmamalıdır.
4. Mevcut kayıt, GitHub repository kimliği veya adayın gerekçelendirdiği eşdeğer benzersiz bir alan üzerinden güncellenmelidir.
5. ETL Kubernetes CronJob olarak saatte bir çalıştırılmalıdır.
6. Çalışma sonucu anlaşılır loglarla gösterilmelidir.

Adayın ETL’nin ilk çalışmasını ve aynı repository tekrar işlendiğinde duplicate oluşmadan güncelleme yapıldığını ekran görüntüsü veya terminal çıktısı ile kanıtlaması beklenmektedir. Ayrıntılı kanıt listesi için repository kökündeki `TESLIM_KANITLARI.md` dosyasını inceleyin.
