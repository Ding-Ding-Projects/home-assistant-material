ARG MATERIAL_IMAGE=ghcr.io/ding-ding-projects/home-assistant-material:2026.11.1.53
FROM ${MATERIAL_IMAGE}
COPY ingress.py panel.html panel.js /opt/material-addon/
ENTRYPOINT ["python3", "-I", "/opt/material-addon/ingress.py"]
