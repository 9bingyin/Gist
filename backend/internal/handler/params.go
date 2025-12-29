package handler

import (
	"strconv"

	"github.com/labstack/echo/v4"
)

func parseIDParam(c echo.Context, name string) (int64, error) {
	return strconv.ParseInt(c.Param(name), 10, 64)
}
