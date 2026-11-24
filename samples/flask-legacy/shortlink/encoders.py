import datetime
import decimal

from flask.json import JSONEncoder


class LegacyEncoder(JSONEncoder):
    """Turns datetimes into ISO strings and Decimals into floats for jsonify()."""

    def default(self, o):
        if isinstance(o, (datetime.datetime, datetime.date)):
            return o.isoformat()
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super().default(o)
