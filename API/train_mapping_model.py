import argparse
import os
import pickle
import numpy as np
import ubjson
from sqlalchemy import create_engine, Column, Integer, Float, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import GridSearchCV, KFold
from xgboost import XGBRegressor

# ===================================================== #
#                      CẤU HÌNH                         #
# ===================================================== #
MAX_ANGLE_RAD = np.deg2rad(60)  # Loại mẫu có góc gaze ngoài ±60°
TVEC_SIGMA = 3.0                # Loại mẫu có tvec ngoài mean ± 3σ từng trục

Base = declarative_base()

# Khai báo lại đúng schema của collect_data.py
class Data(Base):
    __tablename__ = 'data'

    id = Column(Integer, primary_key=True)
    pitch = Column(Float)
    yaw = Column(Float)
    x = Column(Float)
    y = Column(Float)
    rvec = Column(JSON)
    tvec = Column(JSON)

# ===================================================== #
#                  ĐỌC VÀ LỌC DỮ LIỆU                   #
# ===================================================== #
def load_data(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(
            f"Không tìm thấy '{db_path}'. Chạy collect_data.py để thu thập dữ liệu trước.")

    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    session = Session()
    rows = session.query(Data).all()
    session.close()

    records = []
    for r in rows:
        if None in (r.pitch, r.yaw, r.x, r.y) or r.rvec is None or r.tvec is None:
            continue
        records.append([r.pitch, r.yaw, *r.rvec, *r.tvec, r.x, r.y])

    if not records:
        raise ValueError("Database không có mẫu hợp lệ.")
    return np.array(records, dtype=np.float64)


def filter_outliers(data):
    pitch, yaw = data[:, 0], data[:, 1]
    tvec = data[:, 5:8]

    mask_angle = (np.abs(pitch) <= MAX_ANGLE_RAD) & (np.abs(yaw) <= MAX_ANGLE_RAD)

    mu, sigma = tvec.mean(axis=0), tvec.std(axis=0)
    sigma[sigma == 0] = np.inf
    mask_tvec = np.all(np.abs(tvec - mu) <= TVEC_SIGMA * sigma, axis=1)

    mask = mask_angle & mask_tvec
    return data[mask], int((~mask_angle).sum()), int((mask_angle & ~mask_tvec).sum())

# ===================================================== #
#                      HUẤN LUYỆN                       #
# ===================================================== #
# Feature: [pitch, yaw, rvec(3), tvec(3)] — dùng góc thô (không tan) vì
# runtime (fit_calibration, Calibration.predict) nạp đúng dạng này, và
# model cây bất biến với biến đổi đơn điệu như tan.
def train_xgb(X, y):
    base_params = dict(
        objective="reg:squarederror",
        subsample=0.9,
        colsample_bytree=0.9,
        n_jobs=-1,
    )

    if len(X) >= 30:
        grid = GridSearchCV(
            XGBRegressor(**base_params),
            param_grid={
                "n_estimators": [300, 600],
                "max_depth": [3, 5],
                "learning_rate": [0.05, 0.1],
            },
            cv=KFold(n_splits=3, shuffle=True, random_state=42),
            scoring="neg_mean_squared_error",
        )
        grid.fit(X, y)
        best = grid.best_params_
        rmse = float(np.sqrt(-grid.best_score_))
        print(f"Tham số tốt nhất (3-fold CV): {best}")
        print(f"RMSE CV (đơn vị chuẩn hóa màn hình): {rmse:.5f}")
    else:
        best = dict(n_estimators=300, max_depth=3, learning_rate=0.1)
        print(f"Chỉ có {len(X)} mẫu (<30): bỏ qua grid search, dùng tham số mặc định {best}")

    model = XGBRegressor(**base_params, **best)
    model.fit(X, y)
    return model


def train_linear(X, y):
    model = LinearRegression()
    model.fit(X, y)
    rmse = float(np.sqrt(np.mean((model.predict(X) - y) ** 2)))
    print(f"RMSE trên tập train (đơn vị chuẩn hóa màn hình): {rmse:.5f}")
    return model


def save_model(model, model_name, out_path):
    # Lưu cùng 1 tên file, định dạng phải khớp với cách load trong calibration.py:
    # - "xgb": XGBRegressor.load_model() -> định dạng native của XGBoost
    # - "linear"/"svr": ubjson {"py_pickle": pickle bytes} -> pickle.loads()
    if model_name == "xgb":
        model.save_model(out_path)
    else:
        with open(out_path, "wb") as f:
            ubjson.dump({"py_pickle": pickle.dumps(model)}, f)

# ===================================================== #
#                         MAIN                          #
# ===================================================== #
def main():
    parser = argparse.ArgumentParser(description="Huấn luyện model mapping (pitch, yaw, rvec, tvec) -> (x, y)")
    parser.add_argument("--model", type=str, default="xgb", choices=["linear", "xgb"],
                        help="Loại model: 'linear' (LinearRegression) hoặc 'xgb' (XGBoost)")
    parser.add_argument("--db", type=str, default="my_database.db")
    parser.add_argument("--out", type=str, default="weights/calibrator.ubj")
    args = parser.parse_args()

    data = load_data(args.db)
    data, n_angle, n_tvec = filter_outliers(data)

    X = data[:, 0:8]    # [pitch, yaw, rvec(3), tvec(3)]
    y = data[:, 8:10]   # [x, y] đã chuẩn hóa theo kích thước màn hình

    print(f"Tổng số mẫu hợp lệ: {len(data)} "
          f"(loại {n_angle} mẫu có góc > ±60°, {n_tvec} mẫu có tvec ngoài 3σ)")

    if args.model == "xgb":
        model = train_xgb(X, y)
    else:
        model = train_linear(X, y)

    save_model(model, args.model, args.out)
    print(f"Đã lưu model '{args.model}' vào '{args.out}'")
    print(f"Chạy runtime với: python main.py --calibrator {args.model}")


if __name__ == "__main__":
    main()
