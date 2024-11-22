import json

class TableauDataParser:
    def __init__(self, json_data):
        self.data = json_data
        self.data_segments = self._get_data_segments()
        self.columns = self._get_columns()

    def _get_data_segments(self):
        """Extract the data segments containing actual values"""
        try:
            return self.data["secondaryInfo"]["presModelMap"]["dataDictionary"]["presModelHolder"]["genDataDictionaryPresModel"]["dataSegments"]
        except KeyError:
            return {}

    def _get_columns(self):
        """Extract column definitions"""
        try:
            viz_data = self.data["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"]["genPresModelMapPresModel"]["presModelMap"]["EventSummary"]["presModelHolder"]["genVizDataPresModel"]
            return viz_data["paneColumnsData"]["vizDataColumns"]
        except KeyError:
            return []

    def get_column_names(self):
        """Get list of column names"""
        return [col.get("fieldCaption") for col in self.columns if col.get("fieldCaption")]

    def get_column_data(self, column_name):
        """Get data for a specific column"""
        # Find the column definition
        col_def = next((col for col in self.columns if col.get("fieldCaption") == column_name), None)
        if not col_def:
            return []

        # Get indices from pane columns
        pane_idx = col_def["paneIndices"][0]
        col_idx = col_def["columnIndices"][0]

        try:
            viz_data = self.data["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"]["genPresModelMapPresModel"]["presModelMap"]["EventSummary"]["presModelHolder"]["genVizDataPresModel"]
            pane_columns = viz_data["paneColumnsData"]["paneColumnsList"][pane_idx]["vizPaneColumns"][col_idx]

            # Get value indices
            value_indices = pane_columns["valueIndices"]

            # Map indices to actual values from data segments
            data_type = col_def.get("dataType")
            if data_type:
                segment_values = []
                for segment in self.data_segments.values():
                    for col in segment["dataColumns"]:
                        if col["dataType"] == data_type:
                            segment_values.extend(col["dataValues"])

                return [segment_values[i] for i in value_indices]

        except (KeyError, IndexError):
            return []

    def to_dict(self, columns_to_skip=None):
        """Convert all data to dictionary format, excluding specified columns"""
        if columns_to_skip is None:
            columns_to_skip = ["Measure Names", "Measure Values", "Open/Close",
                              "Customer/Contact", "StartDate", "CustomerContact"]

        result = {}
        for col_name in self.get_column_names():
            if col_name not in columns_to_skip:
                result[col_name] = self.get_column_data(col_name)
        return result


with open('data.json', 'r') as f:
    json_data = f.read()

json_data = json.loads(json_data)

parser = TableauDataParser(json_data)

# # Get column names
# columns = parser.get_column_names()
# print("Columns:", columns)

# # Get data for specific column
# building_data = parser.get_column_data("Building")
# print("Building data:", building_data)

all_data = parser.to_dict()

with open('output.json', 'w', encoding='utf-8') as f:
    json.dump(all_data, f, indent=4, ensure_ascii=False)
