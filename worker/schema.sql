CREATE TABLE
    medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hoat_chat TEXT,
        biet_duoc TEXT,
        dang_bao_che TEXT,
        duong_tiem TEXT,
        nhom_tac_dung TEXT,
        chong_chi_dinh TEXT,
        lieu_toi_da TEXT,
        dung_moi TEXT,
        thoi_gian_tiem TEXT,
        luu_y TEXT,
        tuong_ky TEXT,
        hinh_anh TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

INSERT INTO
    medicines (
        hoat_chat,
        biet_duoc,
        dang_bao_che,
        duong_tiem,
        nhom_tac_dung,
        chong_chi_dinh,
        lieu_toi_da,
        dung_moi,
        thoi_gian_tiem,
        luu_y,
        tuong_ky,
        hinh_anh
    )
VALUES
    (
        'Amikacin (Chemacin) 500mg/2ml',
        'Chemacin',
        'Dung dịch tiêm',
        'Tiêm bắp, truyền tĩnh mạch',
        'Kháng sinh aminoglycosid',
        'Quá mẫn với thành phần của thuốc<br>Những trường hợp bệnh nhân nhược cơ',
        'Tổng liều hàng ngày không được quá 15 - 20 mg/kg',
        'NaCl 0,9%, Dextrose 5%',
        'Tiêm bắp, truyền tĩnh mạch chậm',
        'Sau khi pha loãng cần dùng càng sớm càng tốt',
        'Không được trộn lẫn với thuốc khác',
        'https://via.placeholder.com/400x250?text=Chemacin+500mg'
    );