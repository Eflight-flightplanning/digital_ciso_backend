import os
from collections import defaultdict

from api.models import StatusChoices
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, Spacer, Table, TableStyle

from .base import (
    BaseComplianceReportGenerator,
    ComplianceData,
    get_requirement_metadata,
)
from .charts import create_horizontal_bar_chart, get_chart_color_for_percentage
from .config import (
    COLOR_BLUE,
    COLOR_BORDER_GRAY,
    COLOR_DARK_GRAY,
    COLOR_GRAY,
    COLOR_GRID_GRAY,
    COLOR_HIGH_RISK,
    COLOR_LIGHT_BLUE,
    COLOR_SAFE,
    COLOR_WHITE,
    NCA_ECC_SECTIONS,
)


class NCAReportGenerator(BaseComplianceReportGenerator):
    """
    PDF report generator for Saudi National Cybersecurity Authority (NCA) frameworks:
    - NCA Essential Cybersecurity Controls (ECC-1:2018)
    - NCA Cloud Cybersecurity Controls (CSCC-1:2019)

    This generator produces:
    - Cover page with Digital CISO logo and dynamic NCA framework metadata
    - Executive summary with overall compliance score
    - Domain/Section compliance analysis with horizontal bar charts
    - Section breakdown table
    - Requirements index organized by domain
    - Detailed findings for failed requirements
    """

    def create_cover_page(self, data: ComplianceData) -> list:
        """Create the NCA report cover page."""
        elements = []

        platform_logo_path = os.path.join(
            os.path.dirname(__file__), "../../assets/img/platform_logo.png"
        )
        if not os.path.exists(platform_logo_path):
            platform_logo_path = os.path.join(
                os.path.dirname(__file__), "../../assets/img/logo.png"
            )

        if os.path.exists(platform_logo_path):
            logo = Image(platform_logo_path, width=4.5 * inch, height=0.9 * inch)
            elements.append(logo)

        elements.append(Spacer(1, 0.4 * inch))

        # Title
        c_id = getattr(data, "compliance_id", "").lower()
        if "2024" in c_id or "2" in c_id:
            if "ecc" in self.config.name.lower() or "ecc" in c_id:
                framework_title = "NCA Essential Cybersecurity Controls (ECC-2:2024)"
            else:
                framework_title = "NCA Cloud Cybersecurity Controls (CCC-2:2024)"
        else:
            if "ecc" in self.config.name.lower() or "ecc" in c_id:
                framework_title = "NCA Essential Cybersecurity Controls (ECC-1:2018)"
            else:
                framework_title = "NCA Cloud Cybersecurity Controls (CCC/CSCC)"

        title = Paragraph(
            f"{framework_title}<br/>National Cybersecurity Authority Attestation",
            self.styles["title"],
        )
        elements.append(title)
        elements.append(Spacer(1, 0.3 * inch))

        info_rows = self._build_info_rows(data, language="en")
        metadata_data = []
        for label, value in info_rows:
            if label in ("Name:", "Description:") and value:
                metadata_data.append(
                    [label, Paragraph(value, self.styles["normal_center"])]
                )
            else:
                metadata_data.append([label, value])

        metadata_table = Table(metadata_data, colWidths=[2 * inch, 4.5 * inch])
        metadata_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), COLOR_BLUE),
                    ("TEXTCOLOR", (0, 0), (0, -1), COLOR_WHITE),
                    ("BACKGROUND", (1, 0), (1, -1), COLOR_WHITE),
                    ("TEXTCOLOR", (1, 0), (1, -1), COLOR_GRAY),
                    ("FONTNAME", (0, 0), (-1, -1), "PlusJakartaSans"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER_GRAY),
                ]
            )
        )
        elements.append(metadata_table)
        elements.append(Spacer(1, 0.5 * inch))

        return elements

    def create_charts_section(self, data: ComplianceData) -> list:
        """Create domain compliance chart section."""
        elements = []
        elements.append(
            Paragraph("NCA Domain Compliance Analysis", self.styles["h1"])
        )
        elements.append(Spacer(1, 0.2 * inch))

        # Group requirements by Section
        section_stats = defaultdict(lambda: {"passed": 0, "failed": 0, "total": 0})
        for req in data.requirements:
            meta = get_requirement_metadata(req)
            section = meta.get("Section", "General Controls")
            section_stats[section]["total"] += 1
            if req.status == StatusChoices.PASS:
                section_stats[section]["passed"] += 1
            elif req.status == StatusChoices.FAIL:
                section_stats[section]["failed"] += 1

        chart_labels = []
        chart_percentages = []
        for sec, stats in sorted(section_stats.items()):
            if stats["total"] > 0:
                pct = round((stats["passed"] / stats["total"]) * 100, 1)
                chart_labels.append(sec[:35])
                chart_percentages.append(pct)

        if chart_labels and chart_percentages:
            chart = create_horizontal_bar_chart(
                categories=chart_labels,
                values=chart_percentages,
                title="NCA Domain Compliance Scores (%)",
                width=6.5 * inch,
                height=3.2 * inch,
            )
            if chart:
                elements.append(chart)
                elements.append(Spacer(1, 0.3 * inch))

        return elements
