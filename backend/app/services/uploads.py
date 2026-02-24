from __future__ import annotations

import codecs
from pathlib import Path

from fastapi import HTTPException, UploadFile, status


CHUNK_SIZE = 1024 * 1024


async def save_upload_utf8(
    upload: UploadFile,
    destination: Path,
    max_upload_size_bytes: int,
) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)

    decoder = codecs.getincrementaldecoder("utf-8")()
    bytes_written = 0

    with destination.open("wb") as output:
        while True:
            chunk = await upload.read(CHUNK_SIZE)
            if not chunk:
                break

            bytes_written += len(chunk)
            if bytes_written > max_upload_size_bytes:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds max upload size of {max_upload_size_bytes} bytes.",
                )

            try:
                decoder.decode(chunk)
            except UnicodeDecodeError as exc:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Uploaded file is not valid UTF-8. "
                        "Please upload a UTF-8 encoded .txt file."
                    ),
                ) from exc

            output.write(chunk)

        try:
            decoder.decode(b"", final=True)
        except UnicodeDecodeError as exc:
            output.close()
            destination.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Uploaded file is not valid UTF-8. "
                    "Please upload a UTF-8 encoded .txt file."
                ),
            ) from exc

    await upload.close()
    return bytes_written

