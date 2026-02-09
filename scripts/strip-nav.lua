-- Pandoc Lua filter: strip sidebar, scripts, and nav elements before markdown conversion
function Div(el)
    if el.identifier == "sidebar" then return {} end
    return el
end

function RawBlock(el)
    if el.format == "html" and (el.text:match("<script") or el.text:match("<nav")) then
        return {}
    end
    return el
end
