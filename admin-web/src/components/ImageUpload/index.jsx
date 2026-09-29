// File Name: index.jsx
// Created Time: 2026-09-22 19:42:46
// Update Time: 2026-09-22 19:42:46


import { useState } from 'react'
import { Upload, App } from 'antd'
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons'
import { uploadFile } from '@/services/upload'
import { assetUrl } from '@/utils/asset'

const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif'
const MAX_MB = 10

export default function ImageUpload({
  value,
  onChange,
  scope = 'equipment',
  size = 120,
}) {
  const { message } = App.useApp()
  const [uploading, setUploading] = useState(false)

  const beforeUpload = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ACCEPT.split(',').includes(ext)) {
      message.error('仅支持 jpg / png / webp / gif')
      return Upload.LIST_IGNORE
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`文件不能超过 ${MAX_MB} MB`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  const customRequest = async ({ file, onSuccess, onError }) => {
    setUploading(true)
    try {
      const data = await uploadFile(file, scope)
      // 落库用相对路径 path（与 cover_path / avatar_path 的存储口径一致）；
      // 预览由 assetUrl 统一补 /static 前缀，见 utils/asset.js。
      onChange?.(data.path ?? data.url)
      onSuccess?.(data)
    } catch (err) {
      message.error(err.message || '上传失败')
      onError?.(err)
    } finally {
      setUploading(false)
    }
  }

  const boxStyle = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#fafafa',
    cursor: 'pointer',
  }

  return (
    <Upload
      listType="picture-card"
      showUploadList={false}
      accept={ACCEPT}
      beforeUpload={beforeUpload}
      customRequest={customRequest}
      style={{ width: size, height: size }}
    >
      {value ? (
        <div style={boxStyle}>
          <img
            src={assetUrl(value)}
            alt="cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div style={boxStyle}>
          {uploading ? <LoadingOutlined /> : <PlusOutlined />}
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            {uploading ? '上传中' : '上传图片'}
          </div>
        </div>
      )}
    </Upload>
  )
}
