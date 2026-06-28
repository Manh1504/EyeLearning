from torchvision import transforms
# import cv2 
from PIL import Image

class Preprocessing:
    def __init__(self, size=224, device="cuda"):
        self.transformers = transforms.Compose([
                transforms.Resize((size, size)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                )])
        self.device = device

    def process(self, frame):
        frame_rgb = Image.fromarray(frame)
        return self.transformers(frame_rgb).unsqueeze(0).to(self.device)

    def __call__(self, frame):
        return self.process(frame)