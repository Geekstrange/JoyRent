package handler

import (
	"time"

	"github.com/gin-gonic/gin"

	"rental-platform/internal/repository"
	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type EquipmentHandler struct {
	svc *service.EquipmentService
}

func NewEquipmentHandler(svc *service.EquipmentService) *EquipmentHandler {
	return &EquipmentHandler{svc: svc}
}

func (h *EquipmentHandler) List(c *gin.Context) {
	f := repository.EquipmentFilter{
		CategoryID: queryInt64(c, "category_id", 0),
		Keyword:    queryString(c, "keyword"),
	}
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c), f)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// queryString 取 query 参数并做「脏值」清洗。
//
// ⚠️ 为什么必须清洗（真实踩坑）：
// 小程序端 `Taro.request` 会把 GET data 里值为 undefined 的字段
// 序列化成**字符串** "undefined" 拼进 query：
//
//	{ keyword: undefined }  →  ?keyword=undefined
//
// 于是 `c.Query("keyword")` 拿到的是非空字符串 "undefined"，
// 后端就真的去 `name ILIKE '%undefined%'` 过滤，结果 0 条命中、
// 前端显示「没有找到匹配的设备」——而库里明明有数据，极难归因。
//
// 因此把 "undefined" / "null" 这类前端序列化占位符一律视为「未传」。
func queryString(c *gin.Context, name string) string {
	s := c.Query(name)
	if s == "undefined" || s == "null" {
		return ""
	}
	return s
}

func (h *EquipmentHandler) Get(c *gin.Context) {
	e, err := h.svc.Get(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, e)
}

type equipmentReq struct {
	CategoryID   int64  `json:"category_id"`
	Name         string `json:"name"`
	Spec         string `json:"spec"`
	Description  string `json:"description"`
	CoverPath    string `json:"cover_path"`
	DailyCents   int64  `json:"daily_cents"`
	DepositCents int64  `json:"deposit_cents"`
	Total        int    `json:"total"`
}

func (r equipmentReq) toInput() service.EquipmentInput {
	return service.EquipmentInput{
		CategoryID:   r.CategoryID,
		Name:         r.Name,
		Spec:         r.Spec,
		Description:  r.Description,
		CoverPath:    r.CoverPath,
		DailyCents:   r.DailyCents,
		DepositCents: r.DepositCents,
		Total:        r.Total,
	}
}

func (h *EquipmentHandler) Create(c *gin.Context) {
	var req equipmentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	e, err := h.svc.Create(c.Request.Context(), merchantOrDefault(c), req.toInput())
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, e)
}

func (h *EquipmentHandler) Update(c *gin.Context) {
	var req equipmentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	id := pathInt64(c, "id")
	if err := h.svc.Update(c.Request.Context(), merchantOrDefault(c), id, req.toInput()); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": id})
}

func (h *EquipmentHandler) Delete(c *gin.Context) {
	id := pathInt64(c, "id")
	if err := h.svc.Delete(c.Request.Context(), merchantOrDefault(c), id); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": id})
}

// ---------- 设备单元 ----------

func (h *EquipmentHandler) ListUnits(c *gin.Context) {
	list, err := h.svc.ListUnits(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

type generateUnitsReq struct {
	Count int `json:"count"`
}

func (h *EquipmentHandler) GenerateUnits(c *gin.Context) {
	var req generateUnitsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	n, err := h.svc.GenerateUnits(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"), req.Count)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"created": n})
}

type unitStatusReq struct {
	Status string `json:"status"`
}

func (h *EquipmentHandler) UpdateUnitStatus(c *gin.Context) {
	var req unitStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.UpdateUnitStatus(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "unit_id"), req.Status); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": pathInt64(c, "unit_id")})
}

// ---------- 可用量 ----------

func (h *EquipmentHandler) Availability(c *gin.Context) {
	id := pathInt64(c, "id")
	days := int(queryInt64(c, "days", 14))
	bars, err := h.svc.AvailabilityBars(c.Request.Context(), merchantOrDefault(c), id, days)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, bars)
}

// AvailabilityForPeriod 用户端可用量查询。
// 两种调用形式都支持（前端 getAvailability 传 days，getAvailabilityForPeriod 传 start/end）：
//   - start + end  → 返回 { available: n }
//   - 仅 days      → 返回未来 N 天的每日可用台数数组
func (h *EquipmentHandler) AvailabilityForPeriod(c *gin.Context) {
	id := pathInt64(c, "id")
	startStr, endStr := c.Query("start"), c.Query("end")

	// 传了 start/end：按租期精确查可用台数
	if startStr != "" || endStr != "" {
		start, err1 := time.Parse("2006-01-02", startStr)
		end, err2 := time.Parse("2006-01-02", endStr)
		if err1 != nil || err2 != nil {
			response.BadRequest(c, "start/end 日期格式应为 YYYY-MM-DD")
			return
		}
		n, err := h.svc.AvailableCount(c.Request.Context(), merchantOrDefault(c), id, start, end)
		if err != nil {
			fail(c, err)
			return
		}
		response.OK(c, gin.H{"available": n})
		return
	}

	// 只传 days：返回未来 N 天柱状数据
	days := int(queryInt64(c, "days", 14))
	if days <= 0 || days > 90 {
		response.BadRequest(c, "days 需在 1-90 之间")
		return
	}
	bars, err := h.svc.AvailabilityBars(c.Request.Context(), merchantOrDefault(c), id, days)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, bars)
}
