def format_label(original_label):
    label = original_label
    if not ":" in original_label:
        label = "{label}:{label}".format(label = label)
    if not original_label.startswith("//"):
        label = "//" + label
    return label
