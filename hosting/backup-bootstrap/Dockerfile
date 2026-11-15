# Build arguments are supplied by the root build's reviewed dependency lock.
# No private input, source image, backup, certificate or key belongs in this context.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG PYTHON_VERSION
ARG QEMU_VERSION
ARG E2FSPROGS_VERSION
RUN test -n "$PYTHON_VERSION" && test -n "$QEMU_VERSION" && test -n "$E2FSPROGS_VERSION" \
    && apk add --no-cache "python3=$PYTHON_VERSION" "qemu-img=$QEMU_VERSION" "e2fsprogs=$E2FSPROGS_VERSION" "e2fsprogs-extra=$E2FSPROGS_VERSION"
COPY prepare.py /opt/prepare.py
ENTRYPOINT ["python3", "/opt/prepare.py"]
