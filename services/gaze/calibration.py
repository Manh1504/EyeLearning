import pickle

import numpy as np
import ubjson
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold
from sklearn.multioutput import MultiOutputRegressor


class Calibration:
    def __init__(self):
        self.model = MultiOutputRegressor(LinearRegression())

    def create_model(self, X, y):
        self.model.fit(X, y)

    def predict(self, pitch, yaw):  # -> (float, float)
        x, y = self.model.predict(np.array([[pitch, yaw]]))[0]
        return float(x), float(y)

    def evaluate(self, X, y, k=5):  # MAE pixel (5-fold), fit lại full sau đó
        errs = []
        for tr, te in KFold(k, shuffle=True, random_state=42).split(X):
            self.model.fit(X[tr], y[tr])
            errs.append(np.abs(self.model.predict(X[te]) - y[te]).mean())
        self.model.fit(X, y)
        return float(np.mean(errs))

    def serialize(self):  # -> bytes (ubjson + pickle)
        return ubjson.dumpb({"py_pickle": pickle.dumps(self.model)})

    def deserialize(self, data):  # bytes -> model
        self.model = pickle.loads(ubjson.loadb(data)["py_pickle"])

    def save(self, path):
        open(path, "wb").write(self.serialize())

    def load(self, path):
        self.deserialize(open(path, "rb").read())
